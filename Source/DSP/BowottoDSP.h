#pragma once

#include <juce_dsp/juce_dsp.h>
#include <cmath>
#include <array>

namespace bowotto
{

//==============================================================================
/** One-pole follower coefficient for a block-rate update. Family utility. */
inline float onePoleBlockCoef (float timeMs, float blockSamples, double sampleRate) noexcept
{
    if (timeMs <= 0.0f)
        return 1.0f;

    return 1.0f - std::exp (-blockSamples / (float) (timeMs * 0.001 * sampleRate));
}

//==============================================================================
/** TPT state variable filter (Zavalishin) — lifted from the Forge / Vice /
    Vulture / Toa family. Stays stable and click-free when the cutoff moves.

    HOUSE RULE (learned the hard way on The Toa v1.4.1): bandpass() returns
    bp * R2 — UNITY peak gain, not Q. A wet/dry blend built on it needs makeup
    and a regeneration loop built on it needs gain > 1 to sustain. */
struct SvfTPT
{
    void prepare (double sr) noexcept
    {
        sampleRate = sr;
        reset();
        setCutoffQ (150.0f, 0.707f);
    }

    void reset() noexcept { s1 = s2 = 0.0f; }

    void setCutoffQ (float freqHz, float q) noexcept
    {
        const auto nyquistish = (float) sampleRate * 0.49f;
        freqHz = juce::jlimit (10.0f, nyquistish, freqHz);
        q      = juce::jmax (0.05f, q);

        g  = std::tan (juce::MathConstants<float>::pi * freqHz / (float) sampleRate);
        R2 = 1.0f / q;
        h  = 1.0f / (1.0f + R2 * g + g * g);
    }

    inline void tick (float x, float& lp, float& bp, float& hp) noexcept
    {
        hp = h * (x - s1 * (g + R2) - s2);

        const float v1 = g * hp;
        bp = v1 + s1;
        s1 = bp + v1;

        const float v2 = g * bp;
        lp = v2 + s2;
        s2 = lp + v2;
    }

    inline float lowpass (float x) noexcept  { float lp, bp, hp; tick (x, lp, bp, hp); return lp; }
    inline float highpass (float x) noexcept { float lp, bp, hp; tick (x, lp, bp, hp); return hp; }
    inline float bandpass (float x) noexcept { float lp, bp, hp; tick (x, lp, bp, hp); return bp * R2; }

    double sampleRate { 44100.0 };
    float  g { 0.0f }, R2 { 1.0f }, h { 1.0f };
    float  s1 { 0.0f }, s2 { 0.0f };
};

//==============================================================================
/** DC blocker between clipping stages — asymmetric bias walks the signal off
    centre and eats the next stage's headroom otherwise. */
struct DcBlocker
{
    void prepare (double sr) noexcept
    {
        R = 1.0f - juce::MathConstants<float>::twoPi * 18.0f / (float) sr;
        reset();
    }

    void reset() noexcept { x1 = y1 = 0.0f; }

    inline float process (float x) noexcept
    {
        const float y = x - x1 + R * y1;
        x1 = x;
        y1 = y;
        return y;
    }

    float R { 0.999f };
    float x1 { 0.0f }, y1 { 0.0f };
};

//==============================================================================
struct OnePoleLP
{
    void prepare (double sr, float cutoffHz) noexcept
    {
        sampleRate = sr;
        setCutoff (cutoffHz);
        reset();
    }

    void setCutoff (float cutoffHz) noexcept
    {
        a = 1.0f - std::exp (-juce::MathConstants<float>::twoPi * cutoffHz / (float) sampleRate);
    }

    void reset() noexcept { s = 0.0f; }

    inline float process (float x) noexcept
    {
        s += a * (x - s);
        return s;
    }

    double sampleRate { 44100.0 };
    float a { 1.0f }, s { 0.0f };
};

//==============================================================================
struct OnePoleHP
{
    void prepare (double sr, float cutoffHz) noexcept
    {
        lp.prepare (sr, cutoffHz);
    }

    void setCutoff (float cutoffHz) noexcept { lp.setCutoff (cutoffHz); }
    void reset() noexcept                    { lp.reset(); }

    inline float process (float x) noexcept  { return x - lp.process (x); }

    OnePoleLP lp;
};

//==============================================================================
/** Peak guard, same contract as The Toa's: transparent below the knee, then a
    smooth compression into the ceiling. The wet path must never exceed
    -0.2 dBFS — that is a test, not a hope. */
inline float softLimit (float x) noexcept
{
    constexpr float knee    = 0.70f;
    constexpr float ceiling = 0.97f;

    const float ax = std::abs (x);
    if (ax <= knee)
        return x;

    const float over = ax - knee;
    const float span = ceiling - knee;
    const float y    = knee + span * std::tanh (over / span);
    return x < 0.0f ? -y : y;
}

//==============================================================================
/** Hysteresis noise gate, lifted from The Toa. */
struct NoiseGate
{
    void prepare (double sr) noexcept
    {
        detAttack  = coefFromMs (0.25f, sr);
        detRelease = coefFromMs (60.0f, sr);
        openCoef   = coefFromMs (0.35f, sr);
        closeCoef  = coefFromMs (90.0f, sr);
        holdSamples = (int) (0.045 * sr);
        reset();
    }

    void reset() noexcept
    {
        envelope = 0.0f;
        gain = 1.0f;
        holdCounter = 0;
        open = true;
    }

    inline float process (float x, float thresholdDb) noexcept
    {
        const float rectified = std::abs (x);
        envelope += (rectified > envelope ? detAttack : detRelease) * (rectified - envelope);

        const float envDb = juce::Decibels::gainToDecibels (envelope, -90.0f);

        if (envDb > thresholdDb)
        {
            open = true;
            holdCounter = holdSamples;
        }
        else if (envDb < thresholdDb - 8.0f)
        {
            if (holdCounter > 0)
                --holdCounter;
            else
                open = false;
        }

        const float target = open ? 1.0f : 0.0f;
        gain += (target > gain ? openCoef : closeCoef) * (target - gain);

        // Snap the exponential tail to a true zero once it's inaudible.
        // Behind this gate sits ~74 dB of Muff small-signal gain: a -60 dB
        // leak comes back OUT at chug level. (Found by the bench: the floor
        // measured -54 dB with the gate "closed".)
        if (! open && gain < 1.0e-3f)
            gain = 0.0f;

        lastGainDb = juce::Decibels::gainToDecibels (juce::jmax (gain, 1.0e-4f));

        // Square law: steeper close, tighter between chugs.
        return x * gain * gain;
    }

    float lastGainDb { 0.0f };

private:
    static float coefFromMs (float timeMs, double sr) noexcept
    {
        return 1.0f - std::exp (-1.0f / (float) (timeMs * 0.001 * sr));
    }

    float detAttack { 1.0f }, detRelease { 1.0f };
    float openCoef { 1.0f }, closeCoef { 1.0f };
    float envelope { 0.0f }, gain { 1.0f };
    int   holdSamples { 0 }, holdCounter { 0 };
    bool  open { true };
};

//==============================================================================
/**
    THE MUFF — a four-block model of the Big Muff Pi, Otto's pedal.

        input coupling HP -> clip stage 1 -> clip stage 2 -> tone stack

    The circuit truths this keeps:

    * Each clipping stage is a transistor gain stage with a diode pair in its
      FEEDBACK loop — soft, symmetric, and rounded further by the feedback
      cap. Two cascaded stages, not one hot one, is why a Muff sustains for
      days where a one-stage fuzz just distorts.
    * Each stage is preceded by a coupling highpass that thins the lows
      BEFORE clipping — that pre-clip tightness is why a Muff stays usable
      with the sustain dimed.
    * The tone stack is the signature: a lowpass branch (~340 Hz) and a
      highpass branch (~1.7 kHz) summed at one junction. Where the branches
      overlap they fight, leaving the famous mid scoop around ~750 Hz. TONE
      blends the branches; SCOOP fades a 750 Hz bandpass fill back in — stock
      Pi with SCOOP up, the mids-modded Muff players pay techs for with it
      down.

    Runs inside the oversampled block (the clippers are the aliasing hazard).
*/
struct BigMuff
{
    void prepare (double osRate) noexcept
    {
        couple.prepare (osRate, 90.0f);
        pre1.prepare (osRate, 120.0f);
        pre2.prepare (osRate, 120.0f);
        fb1.prepare (osRate, 5200.0f);
        fb2.prepare (osRate, 5200.0f);
        dc1.prepare (osRate);
        dc2.prepare (osRate);

        toneLP.prepare (osRate);
        toneLP.setCutoffQ (340.0f, 0.60f);
        toneHP.prepare (osRate);
        toneHP.setCutoffQ (1700.0f, 0.60f);
        fill.prepare (osRate);
        fill.setCutoffQ (750.0f, 0.90f);

        reset();
    }

    void reset() noexcept
    {
        couple.reset();
        pre1.reset();
        pre2.reset();
        fb1.reset();
        fb2.reset();
        dc1.reset();
        dc2.reset();
        toneLP.reset();
        toneHP.reset();
        fill.reset();
    }

    /** sustain 0..1, tone 0..1, scoop 0..1 (1 = stock notch), all pre-smoothed. */
    inline float process (float x, float sustain, float tone, float scoop) noexcept
    {
        x = couple.process (x);

        // Stage gain 8x..220x across the SUSTAIN sweep — the Pi has an
        // enormous amount of gain on tap and the bottom of the knob still fuzzes.
        const float drive = 8.0f + 212.0f * sustain * sustain;

        // --- clip stage 1
        float s = pre1.process (x);
        s = clipStage (s, drive, fb1);
        s = dc1.process (s);

        // --- clip stage 2 — slightly cooler, like the real second stage
        //     seeing an already-compressed signal.
        s = pre2.process (s);
        s = clipStage (s, 4.0f + drive * 0.5f, fb2);
        s = dc2.process (s);

        // --- tone stack: two branches fighting across the scoop
        const float lo = toneLP.lowpass (s);
        const float hi = toneHP.highpass (s);
        float y = (1.0f - tone) * lo + tone * hi;

        // SCOOP down fills the notch back in with the very band the stock
        // stack throws away. bandpass() is unity-gain (house rule) so the
        // fill needs its own scale to matter against the summed branches.
        y += (1.0f - scoop) * 0.9f * fill.bandpass (s);

        // Two clippers at unity ceiling still stack up hot: trim so the tone
        // stack's output sits near the input level for the chain after it.
        return y * 0.7f;
    }

private:
    static inline float clipStage (float x, float gain, OnePoleLP& fbCap) noexcept
    {
        // Diode pair in the feedback loop: soft symmetric clip, then the
        // feedback capacitor rounds the corners off the top.
        const float clipped = std::tanh (gain * x);
        return fbCap.process (clipped);
    }

    OnePoleHP couple, pre1, pre2;
    OnePoleLP fb1, fb2;
    DcBlocker dc1, dc2;
    SvfTPT    toneLP, toneHP, fill;
};

//==============================================================================
/**
    Vintage British stack preamp — the amp behind the Muff. Deliberately NOT
    the Toa's 5150: two triode stages instead of three, cooler drive, and the
    asymmetry kept small. A Muff wants an amp on the edge of breakup that
    thickens what the pedal sends it, not an amp that re-distorts everything
    into one flavour. Runs oversampled.
*/
struct VintageAmp
{
    void prepare (double osRate) noexcept
    {
        dc1.prepare (osRate);
        dc2.prepare (osRate);
        fizz.prepare (osRate, 7500.0f);
        reset();
    }

    void reset() noexcept
    {
        dc1.reset();
        dc2.reset();
        fizz.reset();
    }

    /** drive >= 1 from the GAIN knob. */
    inline float process (float x, float drive) noexcept
    {
        // Stage 1 — warm input triode, slight asymmetric bias.
        x = shape (x, drive, 0.14f);
        x = dc1.process (x);
        x = fizz.process (x);

        // Stage 2 — cooler, rounds the top.
        x = shape (x, 1.0f + (drive - 1.0f) * 0.6f, -0.08f);
        x = dc2.process (x);

        return x * 0.95f;
    }

private:
    static inline float shape (float x, float d, float b) noexcept
    {
        // d is contractually >= 1.0 (drive = 1 + gain*0.09), but guard the
        // division anyway: a smoother that ever starts or lands at exactly 0
        // makes this 0/0 = NaN, which then lives forever in the DcBlockers
        // downstream (linear IIR state never clears NaN on its own). That is
        // exactly what happened before prepareToPlay seeded the smoothers
        // with real starting values instead of the default 0 — found by the
        // bench's T16.
        const float dSafe = juce::jmax (0.05f, d);
        return (std::tanh (dSafe * x + b) - std::tanh (b)) / std::tanh (dSafe);
    }

    DcBlocker dc1, dc2;
    OnePoleLP fizz;
};

//==============================================================================
/**
    CLEAN channel — bright, articulate, lightly compressed. Not "the Muff
    with less gain": real clean tone (black-face Fender school, the sound
    under Corgan's verses before the Muff comes back for the chorus) needs
    its own voicing. Reuses the Muff's SUSTAIN/TONE knobs for a different
    job — SUSTAIN drives a fast-attack/slow-release compressor for that
    "always singing" indie sustain, TONE tilts dark/bright around 700 Hz —
    and only ever applies the gentlest edge-of-breakup warmth, never a
    Muff-style clip.
*/
struct CleanPreamp
{
    void prepare (double sr) noexcept
    {
        hp.prepare (sr, 70.0f);
        tiltLP.prepare (sr, 700.0f);
        dc.prepare (sr);
        reset();
    }

    void reset() noexcept
    {
        hp.reset();
        tiltLP.reset();
        dc.reset();
        envelope = 0.0f;
    }

    /** sustain: 0..1 compression amount. tone: 0..1 dark->bright tilt.
        drive: >=1 from the GAIN knob, used gently (never a hard clip). */
    inline float process (float x, float sustain, float tone, float drive) noexcept
    {
        x = hp.process (x);

        // Fast-attack / slow-release envelope follower -> gain reduction.
        const float rectified = std::abs (x);
        const float coeff = rectified > envelope ? 0.4f : 0.004f;
        envelope += coeff * (rectified - envelope);
        const float excess = juce::jmax (0.0f, envelope - 0.22f);
        const float gr = 1.0f / (1.0f + excess * sustain * 7.0f);
        x *= gr;

        // Tilt EQ: symmetric around the 700 Hz split, neutral at tone = 0.5.
        const float low  = tiltLP.process (x);
        const float high = x - low;
        const float t    = (tone - 0.5f) * 2.0f;
        x = low * (1.0f - 0.5f * t) + high * (1.0f + 0.5f * t);

        // Gentle edge-of-breakup warmth — unity gain at drive == 1, and even
        // at the top of the GAIN knob this never approaches the Muff's clip.
        const float dSafe = juce::jmax (0.05f, drive);
        x = std::tanh (dSafe * x) / std::tanh (dSafe);
        x = dc.process (x);

        return x;
    }

private:
    OnePoleHP  hp;
    OnePoleLP  tiltLP;
    DcBlocker  dc;
    float envelope { 0.0f };
};

//==============================================================================
/**
    Synthesised starter IR for the guitar path's cabinet: a 4x12 with
    greenback-school speakers, not the Toa's V30 metal rig. Softer upper-mid
    lift lower down (~1.9 kHz vs the V30's 2.2 kHz spike), warmer mids — the
    scooped Muff supplies its own absence of mids, the cab must not double it.
    Honest procedural stand-in; a measured capture drops in here later.
*/
namespace CabIR
{
    inline juce::AudioBuffer<float> build (double sr)
    {
        const int n = juce::jlimit (256, 4096,
                                    juce::nextPowerOfTwo ((int) (sr * 0.021)));

        juce::AudioBuffer<float> buf (1, n);
        buf.clear();
        buf.setSample (0, 0, 1.0f);

        auto* d = buf.getWritePointer (0);

        auto applyIIR = [&] (juce::IIRCoefficients coeffs)
        {
            juce::IIRFilter f;
            f.setCoefficients (coeffs);
            f.processSamples (d, n);
        };

        applyIIR (juce::IIRCoefficients::makeHighPass   (sr, 78.0));
        applyIIR (juce::IIRCoefficients::makeHighPass   (sr, 74.0));
        applyIIR (juce::IIRCoefficients::makePeakFilter (sr, 105.0, 1.0, 1.5f));   // cab thump
        applyIIR (juce::IIRCoefficients::makePeakFilter (sr, 420.0, 0.9, 0.85f));  // mild mud dip
        applyIIR (juce::IIRCoefficients::makePeakFilter (sr, 1900.0, 1.1, 1.5f));  // greenback lift
        applyIIR (juce::IIRCoefficients::makeLowPass    (sr, 5200.0));             // cone beaming
        applyIIR (juce::IIRCoefficients::makeLowPass    (sr, 5400.0));
        applyIIR (juce::IIRCoefficients::makeLowShelf   (sr, 140.0, 0.8, 1.35f));  // close-mic proximity

        const float tau = 6.0f * 0.001f * (float) sr;
        for (int i = 32; i < n; ++i)
            d[i] *= std::exp (-(float) (i - 32) / tau);

        float energy = 0.0f;
        for (int i = 0; i < n; ++i)
            energy += d[i] * d[i];

        if (energy > 1.0e-9f)
            buf.applyGain (0.85f / std::sqrt (energy));

        return buf;
    }
}

//==============================================================================
/** Tape echo: delay line with a lowpass in the feedback loop (each repeat
    darker than the last, like oxide) plus a slow wow LFO on the read head. */
struct TapeEcho
{
    void prepare (double sr) noexcept
    {
        sampleRate = sr;
        length = juce::nextPowerOfTwo ((int) (sr * 1.2));
        buffer.assign ((size_t) length, 0.0f);
        writePos = 0;
        wowPhase = 0.0f;
        loss.prepare (sr, 3800.0f);
        reset();
    }

    void reset() noexcept
    {
        std::fill (buffer.begin(), buffer.end(), 0.0f);
        loss.reset();
    }

    /** timeMs 80..900, fb 0..0.75, all pre-smoothed. Returns the WET signal. */
    inline float process (float x, float timeMs, float fb) noexcept
    {
        wowPhase += juce::MathConstants<float>::twoPi * 0.7f / (float) sampleRate;
        if (wowPhase > juce::MathConstants<float>::twoPi)
            wowPhase -= juce::MathConstants<float>::twoPi;

        const float wow = 1.0f + 0.0016f * std::sin (wowPhase);
        const float delaySamples = juce::jlimit (16.0f, (float) length - 4.0f,
                                                 timeMs * 0.001f * (float) sampleRate * wow);

        const float readPos = (float) writePos - delaySamples;
        const int   i0 = ((int) std::floor (readPos) % length + length) % length;
        const int   i1 = (i0 + 1) % length;
        const float frac = readPos - std::floor (readPos);

        const float wet = buffer[(size_t) i0] * (1.0f - frac) + buffer[(size_t) i1] * frac;

        buffer[(size_t) writePos] = x + loss.process (wet) * fb;
        writePos = (writePos + 1) % length;

        return wet;
    }

    double sampleRate { 44100.0 };
    std::vector<float> buffer;
    int length { 0 }, writePos { 0 };
    float wowPhase { 0.0f };
    OnePoleLP loss;
};

//==============================================================================
/**
    TREMOLO — amplitude modulation from a free-running sine LFO. No JUCE
    built-in for this one (Phaser and the Chorus-as-flanger below are), so
    it's a small custom block: gain = 1 - depth * 0.5 * (1 - cos(phase)),
    which dips smoothly from 1.0 down to (1-depth) and back, the standard
    "bias/opto" tremolo shape rather than a symmetric double-sided ring mod.
*/
struct Tremolo
{
    void prepare (double sampleRate) noexcept { sr = sampleRate; reset(); }
    void reset() noexcept { phase = 0.0f; }

    /** Advances the LFO once and returns the gain for THIS sample. Split
        from applying it so a stereo pair shares one LFO instant instead of
        calling this twice (which would double the rate) or improvising a
        ratio between channels (which breaks the moment either channel is 0).
        rateHz 0.5..12, depth 0..1, both pre-smoothed. */
    inline float nextGain (float rateHz, float depth) noexcept
    {
        phase += juce::MathConstants<float>::twoPi * rateHz / (float) sr;
        if (phase > juce::MathConstants<float>::twoPi)
            phase -= juce::MathConstants<float>::twoPi;

        return 1.0f - depth * 0.5f * (1.0f - std::cos (phase));
    }

    double sr { 44100.0 };
    float phase { 0.0f };
};

} // namespace bowotto
