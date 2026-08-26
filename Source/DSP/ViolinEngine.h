#pragma once

#include "BowottoDSP.h"

//==============================================================================
// THE BOWOTTO's violin path — the MORPH destination.
//
// This does NOT re-synthesize the note from a pitch tracker. Pitch tracking is
// monophonic, latent, and glitches on chords — and Otto plays chords. Instead
// it does to the guitar signal what a bow does to a string, physically, on the
// audio itself:
//
//   SWELL   removes the pick attack (a bowed note has no transient — the
//           single biggest perceptual cue)
//   SUSTAIN high-ratio compression so the note holds like a bow stroke
//   VIBRATO modulated delay, depth in cents, with the small AM component a
//           real player's finger adds
//   ROSIN   bandpassed noise scaled by the note envelope — the friction layer
//   BODY    THE BOW's 72-resonator modal instrument body (see BowBody.h in
//           ../the-bow — measured signature modes + the 2.3 kHz bridge hill,
//           the one parameter that correlates with perceived violin quality)
//   SECTION detuned, delayed desks fanning the soloist out into an ensemble
//
// Because it processes audio rather than re-synthesizing, it works on chords
// and keeps the player's dynamics.
//==============================================================================

namespace bowotto
{

//==============================================================================
/** xorshift PRNG, from THE BOW. Deterministic per seed — bodies are built the
    same way every time, so renders are reproducible for the bench. */
struct Rng
{
    uint32_t state = 0x12345678u;

    void seed (uint32_t s) noexcept { state = s != 0 ? s : 1u; }

    inline uint32_t next() noexcept
    {
        uint32_t x = state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        return state = x;
    }

    /** uniform in [0, 1) */
    inline float uniform() noexcept { return (float) (next() >> 8) * (1.0f / 16777216.0f); }

    /** uniform in [-1, 1) */
    inline float bipolar() noexcept { return uniform() * 2.0f - 1.0f; }
};

//==============================================================================
enum class Instrument { Violin = 0, Viola, Cello };

/** Signature body modes + bridge hill, from published measurements
    (Euphonics / Gough), carried over from THE BOW where they were tuned
    against real recordings. The hill values are the RADIATED levels, not the
    published +20 dB admittance — that distinction cost THE BOW a version. */
struct BodySpec
{
    float a0, cbr, b1minus, b1plus;   // signature modes
    float hillHz;                     // bridge hill centre
    float hillDb;                     // hill elevation over the valley
    float qLow;                       // Q of the signature modes
    float lowRolloff;                 // nothing radiates below this
    float topHz;                      // response falls away above here
};

inline BodySpec bodySpec (Instrument inst)
{
    switch (inst)
    {
        //                          A0      CBR     B1-     B1+    hill     dB     Q    lowcut  top
        case Instrument::Viola:
            return BodySpec { 220.0f, 330.0f, 375.0f, 445.0f, 1900.0f, 18.0f, 15.0f, 140.0f, 6500.0f };
        case Instrument::Cello:
            return BodySpec {  95.0f, 145.0f, 185.0f, 225.0f, 1300.0f, 15.0f, 13.0f,  60.0f, 5000.0f };
        case Instrument::Violin:
        default:
            return BodySpec { 272.0f, 407.0f, 462.0f, 551.0f, 2300.0f, 14.0f, 16.0f, 190.0f, 8000.0f };
    }
}

/** The radiation envelope in dB, relative to the 700-1500 Hz valley. */
inline float bodyEnvelopeDb (float hz, const BodySpec& s)
{
    if (hz < s.lowRolloff) return -18.0f;

    const float oct = std::log2 (juce::jmax (20.0f, hz) / s.hillHz);
    float db = s.hillDb * std::exp (-0.62f * oct * oct);      // the hill itself

    if (hz < s.hillHz * 0.55f)
        db = juce::jmin (db, 2.0f);

    if (hz < s.b1plus * 1.4f && hz > s.lowRolloff)
        db = juce::jmax (db, 4.0f);

    if (hz > s.topHz)
        db -= 6.0f * std::log2 (hz / s.topHz);

    return db;
}

//==============================================================================
/** Two-pole resonator, one body mode. The b0 = amp*(1-r)*2*sin(w) term level-
    matches modes across frequency — without the sin(w) a 272 Hz mode lands
    ~8x louder than a 2.3 kHz one and silently erases the bridge hill. */
struct Mode
{
    float b0 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float z1 = 0.0f, z2 = 0.0f;
    float amplitude = 0.0f;

    void set (float hz, float q, float amp, float sr) noexcept
    {
        amplitude = amp;
        const float w = juce::MathConstants<float>::twoPi * hz / sr;
        const float r = std::exp (-juce::MathConstants<float>::pi * hz / (q * sr));
        a1 = -2.0f * r * std::cos (w);
        a2 = r * r;
        b0 = amp * (1.0f - r) * 2.0f * std::sin (w);
    }

    void reset() noexcept { z1 = z2 = 0.0f; }

    inline float process (float x) noexcept
    {
        const float y = b0 * x - a1 * z1 - a2 * z2;
        z2 = z1; z1 = y;
        return y;
    }
};

//==============================================================================
/** THE BOW's modal body, carried over: 72 resonators (6 signature/corpus +
    66 realising the measured radiation envelope), then an explicit bridge-
    formant filter — the hill comes from the bridge's own resonance, the bank
    alone can only realise a few dB of macro contrast. */
class BodyModel
{
public:
    static constexpr int kLowModes  = 6;
    static constexpr int kHillModes = 66;
    static constexpr int kTotal     = kLowModes + kHillModes;

    void prepare (double newSampleRate)
    {
        sr = (float) newSampleRate;
        rolloff.prepare (newSampleRate, 190.0f);
        directLP.prepare (newSampleRate, 2500.0f);
        reset();
        configure (Instrument::Violin, true);
    }

    void reset() noexcept
    {
        for (auto& m : modes) m.reset();
        bridgeFormant.reset();
        upperShelf.reset();
        corpusShelf.reset();
        rolloff.reset();
        directLP.reset();
    }

    void configure (Instrument inst, bool force = false)
    {
        if (! force && inst == current)
            return;

        current = inst;

        const auto spec = bodySpec (inst);
        constexpr float resonance = 0.55f;
        const float resoScale = 0.55f + 0.95f * resonance;

        Rng rng;
        rng.seed (0x9e3779b9u ^ (uint32_t) ((int) inst * 2654435761u));

        const float sigHz[4]  = { spec.a0, spec.cbr, spec.b1minus, spec.b1plus };
        const float sigAmp[4] = { 1.00f, 0.55f, 0.85f, 0.70f };

        for (int i = 0; i < 4; ++i)
        {
            const float hz = juce::jlimit (20.0f, 0.45f * sr, sigHz[i]);
            const float q_ = spec.qLow * (0.85f + 0.3f * rng.uniform());
            modes[(size_t) i].set (hz, q_, sigAmp[i] * 1.6f * resoScale, sr);
        }

        for (int i = 4; i < kLowModes; ++i)
        {
            const float hz  = juce::jlimit (20.0f, 0.45f * sr, spec.b1plus * (1.35f + 0.5f * (float) (i - 4)));
            const float amp = juce::Decibels::decibelsToGain (bodyEnvelopeDb (hz, spec))
                              * 0.16f * 1.3f * resoScale;
            modes[(size_t) i].set (hz, spec.qLow * 0.8f, amp, sr);
        }

        // Constant density per octave, amplitudes read off the measured
        // envelope — the bridge hill is BUILT to a target in dB, not hoped for.
        const float bandLo = spec.b1plus * 1.9f;
        const float bandHi = juce::jmin (0.44f * sr, 15000.0f);

        for (int i = 0; i < kHillModes; ++i)
        {
            const float t  = (float) i / (float) (kHillModes - 1);
            const float hz = juce::jlimit (20.0f, 0.45f * sr,
                bandLo * std::pow (bandHi / bandLo, t) * (0.94f + 0.12f * rng.uniform()));

            const float db  = bodyEnvelopeDb (hz, spec);
            const float amp = juce::Decibels::decibelsToGain (db) * 0.16f
                              * (0.75f + 0.5f * rng.uniform()) * resoScale;

            const float q = (10.0f + 24.0f * rng.uniform()) / (1.0f + hz / 6000.0f);

            modes[(size_t) (kLowModes + i)].set (hz, juce::jmax (3.0f, q), amp, sr);
        }

        // Normalise by peak gains, not b0 — b0 = amp*(1-r) is tiny at high Q
        // and dividing by it once multiplied THE BOW's whole body by ~100x.
        float sumAmpSq = 0.0f;
        for (const auto& m : modes) sumAmpSq += m.amplitude * m.amplitude;
        gain = 0.9f / juce::jmax (0.5f, std::sqrt (sumAmpSq));

        bridgeFormant.coefficients = juce::dsp::IIR::Coefficients<float>::makePeakFilter (
            sr, spec.hillHz, 1.6f,
            juce::Decibels::decibelsToGain ((spec.hillDb + 7.0f) * (0.75f + 0.5f * resonance)));
        corpusShelf.coefficients = juce::dsp::IIR::Coefficients<float>::makeLowShelf (
            sr, spec.b1plus * 1.25f, 0.8f,
            juce::Decibels::decibelsToGain (9.0f + 4.0f * resonance));
        upperShelf.coefficients = juce::dsp::IIR::Coefficients<float>::makeHighShelf (
            sr, spec.topHz, 0.7f, juce::Decibels::decibelsToGain (-10.0f));

        rolloff.setCutoff (spec.lowRolloff);
        directLP.setCutoff (juce::jmin (0.45f * sr, spec.hillHz * 1.1f));
    }

    inline float process (float x) noexcept
    {
        float sum = 0.0f;
        for (auto& m : modes)
            sum += m.process (x);

        float y = sum * gain + directLP.process (x) * 0.012f;

        y = upperShelf.processSample (bridgeFormant.processSample (corpusShelf.processSample (y)));

        // Nothing radiates below the body's low limit.
        y -= rolloff.process (y);
        return y;
    }

private:
    std::array<Mode, kTotal> modes;
    juce::dsp::IIR::Filter<float> bridgeFormant, upperShelf, corpusShelf;
    OnePoleLP rolloff, directLP;
    float gain = 1.0f, sr = 44100.0f;
    Instrument current = Instrument::Violin;
};

//==============================================================================
/** SWELL — the Slow Gear move. An onset detector (fast envelope jumping past
    the slow one) ducks the gain to near-zero, which then rises at the SWELL
    rate. The pick transient dies inside the duck; the note fades in like a
    bow stroke. */
struct Swell
{
    void prepare (double sampleRate) noexcept
    {
        sr = sampleRate;
        fastCoef = coefFromMs (1.0f);
        slowCoef = coefFromMs (35.0f);
        holdAttack = 1.0f - std::exp (-1.0f / (float) (0.015 * sr));  // 15 ms up
        holdDecay  = std::exp (-1.0f / (float) (0.45 * sr));           // 450 ms down
        reset();
    }

    void reset() noexcept
    {
        envFast = envSlow = 0.0f;
        peakHold = 0.0f;
        gain = 1.0f;
        refractory = 0;
    }

    /** swellMs 60..1200. Returns the gain applied. */
    inline float process (float x, float swellMs) noexcept
    {
        const float ax = std::abs (x);
        envFast += fastCoef * (ax - envFast);
        envSlow += slowCoef * (ax - envSlow);

        // Peak-hold memory of the current note. Two bench-caught traps live
        // here:
        //  * a fast-vs-slow ratio alone retriggers on every beat crest of a
        //    CHORD (partials beat at their difference frequencies), chopping
        //    the swell into 60 ms sawteeth;
        //  * a hold that tracks envFast INSTANTLY rides up with the new
        //    pick's own 2-3 ms attack, so by the time the envelope could
        //    beat the threshold the memory has already caught up (it lost
        //    by 0.3 % in the trace). The memory attack must be SLOW (15 ms)
        //    so a fast pick outruns it; the beating never does.
        if (envFast > peakHold)
            peakHold += holdAttack * (envFast - peakHold);
        else
            peakHold *= holdDecay;

        if (refractory > 0)
            --refractory;
        else if (envFast > peakHold * 1.3f && envFast > 0.01f)
        {
            gain = 0.03f;
            refractory = (int) (0.06 * sr);
            peakHold = envFast;   // snap: this note is the new memory
        }

        const float rise = 1.0f / juce::jmax (1.0f, swellMs * 0.001f * (float) sr);
        gain = juce::jmin (1.0f, gain + rise);

        return gain;
    }

private:
    float coefFromMs (float ms) const noexcept
    {
        return 1.0f - std::exp (-1.0f / (float) (ms * 0.001 * sr));
    }

    double sr { 44100.0 };

public:   // exposed for the bench's unit probe
    float fastCoef { 1.0f }, slowCoef { 1.0f };
    float envFast { 0.0f }, envSlow { 0.0f };
    float peakHold { 0.0f };
    float holdAttack { 1.0f }, holdDecay { 1.0f };
    float gain { 1.0f };
    int refractory { 0 };
};

//==============================================================================
/**
    BOW DRIVE — the block that makes this a violin instead of a filtered guitar.

    THE PHYSICS. A bowed string does not vibrate like a plucked one. The bow's
    stick-slip cycle drives the string into HELMHOLTZ MOTION, and the resulting
    force on the bridge is a SAWTOOTH: every harmonic present, amplitudes
    falling as 1/n (about -6 dB/octave), sustained for as long as the bow moves.
    A picked electric guitar is the opposite — a sharp transient, then harmonics
    that die off far faster than the fundamental as the note decays.

    So no amount of filtering turns a guitar into a violin. A body filter over a
    decaying pluck is just an EQ'd guitar, which is exactly what v0.1.0 was: the
    bench measured the morph 28 dB down with everything above 800 Hz collapsed
    (-95 dB), because the violin path tapped the RAW DI while the guitar path
    picked up ~30 dB through the Muff and amp.

    THE FIX, and why one block solves both problems:

      compress hard   -> the note stops decaying; it sustains like a bow stroke,
                         and the tail comes back up to playing level
      saturate        -> regenerates the harmonics the decay threw away. Heavy
                         clipping naturally produces a ~1/n harmonic series, so
                         the spectrum lands near the -6 dB/oct Helmholtz target
                         instead of falling off a cliff
      asymmetric bias -> a symmetric clipper makes only ODD harmonics (square);
                         the bias adds the even ones, so the series is a SAW
                         (all harmonics) rather than a hollow square

    That is also the ~30 dB of gain the violin path was missing, so level
    matching and timbre are the same repair.

    FORCE is the real expressive control: on a violin, bow force and speed set
    how bright the tone is (the Schelleng playability wedge). Here it sets how
    hard the string is driven, which is the same perceptual axis.
*/
struct BowDrive
{
    void prepare (double sampleRate) noexcept
    {
        sr = sampleRate;
        // Hard, slow-release compression: this is a sustainer, not a leveller.
        attack  = 1.0f - std::exp (-1.0f / (float) (0.005 * sampleRate));
        release = 1.0f - std::exp (-1.0f / (float) (0.450 * sampleRate));

        dc.prepare (sampleRate);
        gloss.prepare (sampleRate, 6500.0f);
        reset();
    }

    void reset() noexcept
    {
        env = 0.0f;
        dc.reset();
        gloss.reset();
    }

    /** force 0..1, pre-smoothed. Returns a sustained, saw-rich excitation. */
    inline float process (float x, float force) noexcept
    {
        const float ax = std::abs (x);
        env += (ax > env ? attack : release) * (ax - env);

        // --- sustainer: 20:1 above -48 dB, so even the decay tail is pulled
        //     back up to playing level. Envelope-domain, so the waveform is
        //     untouched and the saturator below sees a clean shape.
        const float envDb = juce::Decibels::gainToDecibels (env, -90.0f);
        constexpr float thresholdDb = -48.0f;

        float gainDb = 0.0f;
        if (envDb > thresholdDb)
            gainDb = (thresholdDb - envDb) * (1.0f - 1.0f / 20.0f);

        gainDb = juce::jmin (gainDb + 30.0f, 48.0f);
        float s = x * juce::Decibels::decibelsToGain (gainDb);

        // --- Helmholtz-ish excitation: asymmetric saturation. Drive is large
        //     on purpose — we want a bowed string's continuous sawtooth, not
        //     "a bit of grit". Bias 0.22 fills in the even harmonics.
        // Floor low enough that a soft bow is genuinely gentle: the sustainer
        // ahead of this already adds ~10 dB, so a drive of 6 was well into
        // clipping even at BOW 0 and the knob's bottom half did little.
        const float drive = 2.5f + 45.0f * force;
        const float bias  = 0.22f;
        s = (std::tanh (drive * s + bias) - std::tanh (bias));

        s = dc.process (s);

        // Real bow noise and string tone roll off up top; without this the
        // clipper's top octaves read as fizz rather than rosin.
        s = gloss.process (s);

        return s;
    }

private:
    double sr { 44100.0 };
    float attack { 1.0f }, release { 1.0f }, env { 0.0f };
    DcBlocker dc;
    OnePoleLP gloss;
};

//==============================================================================
/** Player vibrato: pitch component via a modulated delay line, plus the small
    amplitude component a finger rocking on a string actually adds. */
struct Vibrato
{
    void prepare (double sampleRate) noexcept
    {
        sr = sampleRate;
        length = juce::nextPowerOfTwo ((int) (sampleRate * 0.03));
        buffer.assign ((size_t) length, 0.0f);
        writePos = 0;
        phase = 0.0f;
        reset();
    }

    void reset() noexcept
    {
        std::fill (buffer.begin(), buffer.end(), 0.0f);
    }

    /** depth 0..1, pre-smoothed. Rate 6.5 Hz and excursion up to ~±55 cents:
        measured violin vibrato runs 5.1-8.2 Hz (mean 6.65) and about 40 cents
        in first position, wider higher up the neck. v0.1.0's 5.6 Hz / 35 cents
        was audibly under both. */
    inline float process (float x, float depth) noexcept
    {
        buffer[(size_t) writePos] = x;
        writePos = (writePos + 1) % length;

        phase += juce::MathConstants<float>::twoPi * 6.5f / (float) sr;
        if (phase > juce::MathConstants<float>::twoPi)
            phase -= juce::MathConstants<float>::twoPi;

        const float lfo = std::sin (phase);

        // Base delay 12 ms; ±35 cents of a periodic signal needs the delay to
        // swing by ~2% of a period per cent — at 12 ms base this excursion
        // covers real player vibrato across the guitar's range.
        const float base      = 0.012f * (float) sr;
        const float excursion = depth * 0.0040f * (float) sr;
        const float delaySamples = juce::jlimit (2.0f, (float) length - 4.0f,
                                                 base + excursion * lfo);

        const float readPos = (float) writePos - delaySamples;
        const int   i0 = ((int) std::floor (readPos) % length + length) % length;
        const int   i1 = (i0 + 1) % length;
        const float frac = readPos - std::floor (readPos);

        float y = buffer[(size_t) i0] * (1.0f - frac) + buffer[(size_t) i1] * frac;

        // The AM component: a few percent, in phase with the pitch swing.
        y *= 1.0f + depth * 0.06f * lfo;
        return y;
    }

private:
    double sr { 44100.0 };
    std::vector<float> buffer;
    int length { 1 }, writePos { 0 };
    float phase { 0.0f };
};

//==============================================================================
/** ROSIN — the friction layer. Bandpassed noise scaled by the note envelope:
    silent in the gaps, scraping while the "bow" moves. The band sits where
    bow noise actually lives, up on the bridge hill. */
struct Rosin
{
    void prepare (double sampleRate) noexcept
    {
        band.prepare (sampleRate);
        band.setCutoffQ (3400.0f, 1.2f);
        envCoef = 1.0f - std::exp (-1.0f / (float) (0.020 * sampleRate));
        rng.seed (0xC0FEBABEu);
        reset();
    }

    void reset() noexcept
    {
        band.reset();
        env = 0.0f;
    }

    /** amount 0..1, pre-smoothed. Returns the noise to ADD. */
    inline float process (float x, float amount) noexcept
    {
        env += envCoef * (std::abs (x) - env);
        const float noise = band.bandpass (rng.bipolar());
        return noise * env * amount * 1.4f;
    }

private:
    SvfTPT band;
    Rng rng;
    float envCoef { 1.0f }, env { 0.0f };
};

//==============================================================================
/** SECTION — fans the solo line out into desks: detuned (slow independent
    LFOs on short delay lines, the classic micro-detune mechanism), delayed
    (humanize), and spread L/R. Mono in, stereo out. */
struct Section
{
    static constexpr int kDesks = 4;

    void prepare (double sampleRate) noexcept
    {
        sr = sampleRate;
        length = juce::nextPowerOfTwo ((int) (sampleRate * 0.06));

        Rng rng;
        rng.seed (0xB0B0770u);

        for (int i = 0; i < kDesks; ++i)
        {
            auto& d = desks[(size_t) i];
            d.buffer.assign ((size_t) length, 0.0f);
            d.writePos = 0;
            d.phase    = rng.uniform() * juce::MathConstants<float>::twoPi;
            d.rate     = 0.35f + 0.5f * rng.uniform();          // slow, independent
            d.baseMs   = 14.0f + 9.0f * (float) i + 4.0f * rng.uniform();
            d.depthMs  = 1.1f + 0.9f * rng.uniform();           // the detune depth
            d.pan      = (i % 2 == 0) ? -0.8f + 0.25f * (float) i
                                      :  0.8f - 0.25f * (float) (i - 1);
        }
    }

    void reset() noexcept
    {
        for (auto& d : desks)
            std::fill (d.buffer.begin(), d.buffer.end(), 0.0f);
    }

    /** amount 0..1: 0 = soloist only, 1 = full section. */
    inline void process (float x, float amount, float& outL, float& outR) noexcept
    {
        // The soloist sits centre.
        outL = x * 0.5f;
        outR = x * 0.5f;

        if (amount < 0.001f)
        {
            // Keep desk state moving so engaging SECTION doesn't click.
            for (auto& d : desks)
            {
                d.buffer[(size_t) d.writePos] = x;
                d.writePos = (d.writePos + 1) % length;
            }
            return;
        }

        for (auto& d : desks)
        {
            d.buffer[(size_t) d.writePos] = x;
            d.writePos = (d.writePos + 1) % length;

            d.phase += juce::MathConstants<float>::twoPi * d.rate / (float) sr;
            if (d.phase > juce::MathConstants<float>::twoPi)
                d.phase -= juce::MathConstants<float>::twoPi;

            const float delayMs = d.baseMs + d.depthMs * std::sin (d.phase);
            const float delaySamples = juce::jlimit (2.0f, (float) length - 4.0f,
                                                     delayMs * 0.001f * (float) sr);

            const float readPos = (float) d.writePos - delaySamples;
            const int   i0 = ((int) std::floor (readPos) % length + length) % length;
            const int   i1 = (i0 + 1) % length;
            const float frac = readPos - std::floor (readPos);

            const float v = (d.buffer[(size_t) i0] * (1.0f - frac)
                             + d.buffer[(size_t) i1] * frac) * 0.30f * amount;

            outL += v * (1.0f - d.pan) * 0.5f;
            outR += v * (1.0f + d.pan) * 0.5f;
        }
    }

private:
    struct Desk
    {
        std::vector<float> buffer;
        int writePos = 0;
        float phase = 0.0f, rate = 0.4f, baseMs = 18.0f, depthMs = 1.5f, pan = 0.0f;
    };

    double sr { 44100.0 };
    int length { 1 };
    std::array<Desk, kDesks> desks;
};

//==============================================================================
/** The whole violin path, mono in, stereo out. */
class ViolinEngine
{
public:
    void prepare (double sampleRate)
    {
        swell.prepare (sampleRate);
        drive.prepare (sampleRate);
        vibrato.prepare (sampleRate);
        rosin.prepare (sampleRate);
        body.prepare (sampleRate);
        section.prepare (sampleRate);
        pre.prepare (sampleRate, 60.0f);

        lookSamples = (int) (0.005 * sampleRate);
        lookBuf.assign ((size_t) juce::jmax (1, lookSamples), 0.0f);
        lookPos = 0;
    }

    void reset()
    {
        swell.reset();
        drive.reset();
        vibrato.reset();
        rosin.reset();
        body.reset();
        section.reset();
        pre.reset();
        std::fill (lookBuf.begin(), lookBuf.end(), 0.0f);
    }

    void setInstrument (Instrument inst) { body.configure (inst); }

    // Makeup after the body, MEASURED so MORPH is a timbre crossfade and not a
    // volume drop. Set by --diagnose with 18 dB of OUTPUT HEADROOM, so the peak
    // guard is not limiting during the measurement: measured with the guard
    // engaged every setting reads -0.3 dB peak and the number is meaningless
    // (that mistake cost a round trip here). Guitar -26.0 dB vs violin -18.8 dB
    // at 11.7, so 11.7 x 10^(-7.2/20) = 5.1 matches their RMS.
    //
    // Matched on RMS, deliberately not on peak: the guitar path is transient
    // (picked, high crest) and the violin path is sustained (bowed, low crest
    // — the drive's compressor sees to that). Equal RMS is what reads as equal
    // loudness; equalising peaks instead would leave the violin sounding weak.
    static constexpr float kBodyMakeup = 5.1f;

    /** x: post-gate GUITAR signal (pre-fuzz — the violin bows the string, not
        the pedalboard). All params pre-smoothed. */
    inline void process (float x, float swellMs, float vibDepth, float rosinAmt,
                         float sectionAmt, float force, float& outL, float& outR) noexcept
    {
        x = pre.process (x);                       // rumble off the string signal

        // 5 ms lookahead: the onset detector listens to the LIVE signal, the
        // audio runs 5 ms late. Without it the detector's few-ms latency let
        // the pick transient through at full gain before the duck landed —
        // the bench measured a 10 ms attack on a 600 ms swell.
        const float delayed = lookBuf[(size_t) lookPos];
        lookBuf[(size_t) lookPos] = x;
        if (++lookPos >= lookSamples)
            lookPos = 0;

        // DRIVE first, swell second. The other order is a bug the bench
        // caught: a compressor after the swell sees the ducked signal as
        // "quiet", applies makeup, and flattens the bow stroke back into a
        // pick attack. The bow's physical order is this one too: the string is
        // driven into Helmholtz motion, and the stroke shapes how it speaks.
        //
        // The swell DETECTOR reads the raw input, where the pick transient is
        // still intact — after the sustainer there is barely a transient left
        // to detect.
        const float g = swell.process (x, swellMs);

        float s = drive.process (delayed, force);  // Helmholtz-ish excitation
        s *= g;                                    // pick attack dies in the duck
        s = vibrato.process (s, vibDepth);         // player's left hand
        s += rosin.process (s, rosinAmt);          // friction layer
        s = body.process (s);                      // the wooden box
        // No limiter here: at the matched makeup a soft-clip would squash the
        // path back down (it only bought +5.8 dB of the +11.3 needed). The
        // engine's dynamics are already bounded by the drive's compressor and
        // tanh, and the processor's output guard is the tested ceiling (T12).
        s *= kBodyMakeup;

        section.process (s, sectionAmt, outL, outR);
    }

private:
    std::vector<float> lookBuf;
    int lookSamples = 1, lookPos = 0;

    Swell       swell;
    BowDrive    drive;
    Vibrato     vibrato;
    Rosin       rosin;
    BodyModel   body;
    Section     section;
    OnePoleHP   pre;
};

} // namespace bowotto
