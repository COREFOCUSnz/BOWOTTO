/*
    Offline test bench for THE BOWOTTO. Family rules apply:

    * Stability is not audibility — every effect has a test that fails if the
      effect stops DOING anything (The Toa shipped an inaudible wah once;
      never again).
    * A measurement must be able to detect the thing before a pass means
      anything — each audibility test also checks the opposite setting.

    Prints one PASS/FAIL line per test, exits non-zero on any failure.

        BowottoTests                 run the bench
        BowottoTests --render in.wav out.wav [gainDb]
                                     render a real DI through the chain
        BowottoTests --soak <sec>    random param/block churn, watch for NaN
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <iostream>
#include <chrono>

namespace
{
    constexpr double kSampleRate = 48000.0;
    constexpr int    kBlockSize  = 512;

    int gFailures = 0;

    void report (const char* name, bool passed, const juce::String& detail = {})
    {
        std::cout << (passed ? "PASS  " : "FAIL  ") << name;
        if (detail.isNotEmpty())
            std::cout << "  [" << detail << "]";
        std::cout << "\n";
        if (! passed)
            ++gFailures;
    }

    void setParam (TheBowottoAudioProcessor& p, const char* id, float value)
    {
        if (auto* param = p.apvts.getParameter (id))
            param->setValueNotifyingHost (param->convertTo0to1 (value));
        else
            report ("parameter exists", false, id);
    }

    struct Stats
    {
        float peak = 0.0f, rms = 0.0f;
        bool finite = true;
    };

    Stats analyse (const juce::AudioBuffer<float>& buffer, int startSample = 0)
    {
        Stats s;
        double sumSq = 0.0;
        int count = 0;

        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        {
            const auto* d = buffer.getReadPointer (ch);
            for (int i = startSample; i < buffer.getNumSamples(); ++i)
            {
                if (! std::isfinite (d[i]))
                    s.finite = false;
                s.peak = juce::jmax (s.peak, std::abs (d[i]));
                sumSq += (double) d[i] * d[i];
                ++count;
            }
        }

        s.rms = count > 0 ? (float) std::sqrt (sumSq / count) : 0.0f;
        return s;
    }

    /** Synthetic grunge riff: sharp-attack sawtooth power chords with
        exponential decay — the pick transient the SWELL test needs. */
    juce::AudioBuffer<float> makeRiff (double sr, double seconds, float level = 0.30f)
    {
        const int n = (int) (sr * seconds);
        juce::AudioBuffer<float> buf (2, n);
        buf.clear();

        const float roots[] = { 82.41f, 110.0f, 98.0f, 73.42f };   // E2 A2 G2 D2
        const double noteLen = 0.5;                                // 120 BPM eighths x2

        for (int note = 0; note * noteLen < seconds; ++note)
        {
            const int start = (int) (note * noteLen * sr);
            const int len   = juce::jmin ((int) (noteLen * sr), n - start);
            const float f0  = roots[note % 4];

            for (int i = 0; i < len; ++i)
            {
                const double t = i / sr;
                const float env = std::exp (-(float) t * 3.0f);
                float s = 0.0f;
                // Root + fifth, few saw partials each.
                for (float mult : { 1.0f, 1.5f })
                    for (int h = 1; h <= 6; ++h)
                        s += std::sin (juce::MathConstants<double>::twoPi * f0 * mult * h * t)
                             / (float) h;
                const float v = level * env * s * 0.20f;
                buf.addSample (0, start + i, v);
                buf.addSample (1, start + i, v);
            }
        }
        return buf;
    }

    /** Broadband noise burst train, for spectral tests. */
    juce::AudioBuffer<float> makeNoise (double sr, double seconds, float level = 0.25f)
    {
        const int n = (int) (sr * seconds);
        juce::AudioBuffer<float> buf (2, n);
        juce::Random rng (42);
        for (int i = 0; i < n; ++i)
        {
            const float v = level * (rng.nextFloat() * 2.0f - 1.0f);
            buf.setSample (0, i, v);
            buf.setSample (1, i, v);
        }
        return buf;
    }

    juce::AudioBuffer<float> makeSine (double sr, double seconds, float hz, float level = 0.25f)
    {
        const int n = (int) (sr * seconds);
        juce::AudioBuffer<float> buf (2, n);
        for (int i = 0; i < n; ++i)
        {
            const float v = level * (float) std::sin (juce::MathConstants<double>::twoPi * hz * i / sr);
            buf.setSample (0, i, v);
            buf.setSample (1, i, v);
        }
        return buf;
    }

    /** Process a copy of `input` through a fresh prepare with the given
        parameter setup applied first. */
    template <typename Setup>
    juce::AudioBuffer<float> render (TheBowottoAudioProcessor& p,
                                     const juce::AudioBuffer<float>& input,
                                     Setup&& setup,
                                     int blockSize = kBlockSize)
    {
        setup (p);
        p.setRateAndBufferSizeDetails (kSampleRate, blockSize);
        p.prepareToPlay (kSampleRate, blockSize);

        juce::AudioBuffer<float> buf;
        buf.makeCopyOf (input);

        juce::MidiBuffer midi;
        for (int pos = 0; pos < buf.getNumSamples(); pos += blockSize)
        {
            const int len = juce::jmin (blockSize, buf.getNumSamples() - pos);
            juce::AudioBuffer<float> block (buf.getArrayOfWritePointers(),
                                            buf.getNumChannels(), pos, len);
            p.processBlock (block, midi);
        }
        return buf;
    }

    /** Neutral baseline: everything audible off except the amp itself. */
    void baseline (TheBowottoAudioProcessor& p)
    {
        setParam (p, "gate",    -80.0f);
        setParam (p, "muffon",    1.0f);
        setParam (p, "sustain",  65.0f);
        setParam (p, "tone",     50.0f);
        setParam (p, "scoop",   100.0f);
        setParam (p, "gain",     35.0f);
        setParam (p, "morph",     0.0f);
        setParam (p, "swell",   300.0f);
        setParam (p, "vibrato",  45.0f);
        setParam (p, "rosin",    30.0f);
        setParam (p, "section",   0.0f);
        setParam (p, "body",      0.0f);
        setParam (p, "echoon",    0.0f);
        setParam (p, "reverbon",  0.0f);
        setParam (p, "output",    0.0f);
        setParam (p, "bypass",    0.0f);
    }

    float diffDb (const juce::AudioBuffer<float>& a, const juce::AudioBuffer<float>& b,
                  int startSample = 0)
    {
        jassert (a.getNumSamples() == b.getNumSamples());
        double num = 0.0, den = 0.0;
        for (int ch = 0; ch < juce::jmin (a.getNumChannels(), b.getNumChannels()); ++ch)
        {
            const auto* da = a.getReadPointer (ch);
            const auto* db = b.getReadPointer (ch);
            for (int i = startSample; i < a.getNumSamples(); ++i)
            {
                const double d = (double) da[i] - db[i];
                num += d * d;
                den += (double) da[i] * da[i];
            }
        }
        if (den < 1.0e-12)
            return num < 1.0e-12 ? -120.0f : 0.0f;
        return 10.0f * (float) std::log10 (juce::jmax (1.0e-12, num / den));
    }

    /** Goertzel magnitude of one bin over [start, start+len). */
    float goertzel (const juce::AudioBuffer<float>& buf, float hz, int start, int len)
    {
        const double w = juce::MathConstants<double>::twoPi * hz / kSampleRate;
        const double coeff = 2.0 * std::cos (w);
        double s0 = 0.0, s1 = 0.0, s2 = 0.0;
        const auto* d = buf.getReadPointer (0);
        for (int i = start; i < start + len && i < buf.getNumSamples(); ++i)
        {
            s0 = d[i] + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        const double power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        return (float) std::sqrt (juce::jmax (0.0, power)) / (float) len;
    }

    /** Band energy via summed Goertzel probes. 48 of them: a single-bin
        power estimate on one noise realization has ~100 % variance, and at
        12 probes the hill-valley statistic moved 4.3 dB when the signal was
        shifted by 5 ms. At 48 the estimator is stable to well under 1 dB. */
    float bandDb (const juce::AudioBuffer<float>& buf, float lo, float hi,
                  int start, int len, int probes = 48)
    {
        double sum = 0.0;
        for (int i = 0; i < probes; ++i)
        {
            const float hz = lo * std::pow (hi / lo, (float) i / (float) (probes - 1));
            const float m = goertzel (buf, hz, start, len);
            sum += (double) m * m;
        }
        return 10.0f * (float) std::log10 (juce::jmax (1.0e-18, sum / probes));
    }

    /** 10%..90% rise time (ms) of the note envelope starting at `noteStart`. */
    float riseTimeMs (const juce::AudioBuffer<float>& buf, int noteStart, int window)
    {
        const auto* d = buf.getReadPointer (0);
        const int end = juce::jmin (noteStart + window, buf.getNumSamples());

        // Envelope: 5 ms sliding peak.
        const int hop = (int) (0.005 * kSampleRate);
        float peak = 0.0f;
        std::vector<float> env;
        for (int i = noteStart; i + hop <= end; i += hop)
        {
            float m = 0.0f;
            for (int k = 0; k < hop; ++k)
                m = juce::jmax (m, std::abs (d[i + k]));
            env.push_back (m);
            peak = juce::jmax (peak, m);
        }
        if (peak <= 0.0f || env.size() < 4)
            return 0.0f;

        // Measure from the post-onset MINIMUM, not from the window edge: the
        // window's first hops can still carry the previous note's tail (on
        // the violin path, 5 ms of it at pre-duck gain), and treating that
        // spike as the attack makes the measurement blind to the swell.
        const size_t searchEnd = juce::jmax ((size_t) 2, env.size() * 2 / 5);
        size_t minIdx = 0;
        for (size_t i = 1; i < searchEnd; ++i)
            if (env[i] < env[minIdx])
                minIdx = i;

        float localPeak = 0.0f;
        for (size_t i = minIdx; i < env.size(); ++i)
            localPeak = juce::jmax (localPeak, env[i]);
        if (localPeak <= 0.0f)
            return 0.0f;

        int i10 = -1, i90 = -1;
        for (size_t i = minIdx; i < env.size(); ++i)
        {
            if (i10 < 0 && env[i] >= 0.1f * localPeak) i10 = (int) i;
            if (i90 < 0 && env[i] >= 0.9f * localPeak) { i90 = (int) i; break; }
        }
        if (i10 < 0 || i90 < 0)
            return 0.0f;
        return (float) (i90 - i10) * (float) hop * 1000.0f / (float) kSampleRate;
    }
}

//==============================================================================
static void runBench()
{
    TheBowottoAudioProcessor p;
    const auto riff  = makeRiff  (kSampleRate, 4.0);
    const auto noise = makeNoise (kSampleRate, 4.0);
    const int  skip  = (int) (0.5 * kSampleRate);   // settle window

    // T1 — silence in, silence out
    {
        juce::AudioBuffer<float> silence (2, (int) kSampleRate * 2);
        silence.clear();
        auto out = render (p, silence, baseline);
        const auto s = analyse (out);
        report ("T1 silence in -> silence out", s.finite && s.peak < 1.0e-3f,
                juce::String ("peak ") + juce::String (juce::Decibels::gainToDecibels (s.peak, -120.0f), 1) + " dB");
    }

    // T2 — riff at defaults: finite, non-silent, under the ceiling
    {
        auto out = render (p, riff, baseline);
        const auto s = analyse (out);
        report ("T2 riff at defaults is alive and bounded",
                s.finite && s.rms > 1.0e-4f && s.peak <= 0.977f,
                juce::String ("rms ") + juce::String (juce::Decibels::gainToDecibels (s.rms, -120.0f), 1)
                    + " dB, peak " + juce::String (juce::Decibels::gainToDecibels (s.peak, -120.0f), 1) + " dB");
    }

    // T3 — the Muff DOES something (the wah lesson)
    {
        auto off = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "muffon", 0.0f); });
        auto on  = render (p, riff, baseline);
        const float d = diffDb (on, off, skip);
        report ("T3 MUFF off->on is plainly audible", d > -25.0f,
                juce::String ("difference ") + juce::String (d, 1) + " dB vs off");
    }

    // T4 — the tone stack's mid scoop is real and SCOOP controls it
    {
        auto scooped = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "sustain", 80.0f); });
        auto filled  = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "sustain", 80.0f);
                                                        setParam (q, "scoop", 0.0f); });
        const int len = (int) (2.0 * kSampleRate);

        auto notchDepth = [&] (const juce::AudioBuffer<float>& b)
        {
            const float mid   = bandDb (b, 600.0f, 950.0f, skip, len);
            const float flank = 0.5f * (bandDb (b, 280.0f, 420.0f, skip, len)
                                        + bandDb (b, 1400.0f, 2100.0f, skip, len));
            return flank - mid;   // positive = scooped
        };

        const float dScooped = notchDepth (scooped);
        const float dFilled  = notchDepth (filled);
        report ("T4 SCOOP: stock notch present, fill removes it",
                dScooped > 4.0f && (dScooped - dFilled) > 3.0f,
                juce::String ("notch ") + juce::String (dScooped, 1) + " dB stock, "
                    + juce::String (dFilled, 1) + " dB filled");
    }

    // T5 — MORPH lands on a real violin BODY, not an EQ'd guitar.
    //
    // Tests the SIGNATURE MODES (B1- 462 Hz, B1+ 551 Hz), not the bridge hill.
    // The hill sits at 2.3 kHz and the guitar cab has its own greenback lift at
    // 1.9 kHz, so a hill-vs-valley statistic only separated the two paths by
    // 3.9 dB — too close to be evidence of anything. The signature modes are
    // violin-specific and separate by 14-24 dB, so this test can actually fail
    // if the body stops being applied.
    {
        auto gtr = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "output", -18.0f); });
        auto vln = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                    setParam (q, "rosin", 0.0f);
                                                    setParam (q, "swell", 60.0f);
                                                    setParam (q, "output", -18.0f); });
        const int len = (int) (3.0 * kSampleRate);

        auto modeLift = [&] (float hz)
        {
            const float a = juce::Decibels::gainToDecibels (goertzel (gtr, hz, skip, len), -140.0f);
            const float b = juce::Decibels::gainToDecibels (goertzel (vln, hz, skip, len), -140.0f);
            return b - a;
        };

        const float b1minus = modeLift (462.0f);
        const float b1plus  = modeLift (551.0f);
        const float a0      = modeLift (272.0f);

        report ("T5 MORPH=100 applies the violin signature body modes",
                b1minus > 8.0f && b1plus > 8.0f && a0 > 4.0f,
                juce::String ("lift vs guitar: A0 ") + juce::String (a0, 1)
                    + ", B1- " + juce::String (b1minus, 1)
                    + ", B1+ " + juce::String (b1plus, 1) + " dB");
    }

    // T5b — the morph is a TIMBRE crossfade, not a volume drop. This is the
    // bug Corey heard: v0.1.0 lost 28 dB at MORPH 100 ("just gets quiet").
    // Measured with output headroom so the peak guard is not limiting.
    {
        auto g0   = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "output", -18.0f); });
        auto g50  = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 50.0f);
                                                    setParam (q, "output", -18.0f); });
        auto g100 = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                    setParam (q, "output", -18.0f); });
        const float r0   = juce::Decibels::gainToDecibels (analyse (g0,   skip).rms, -120.0f);
        const float r50  = juce::Decibels::gainToDecibels (analyse (g50,  skip).rms, -120.0f);
        const float r100 = juce::Decibels::gainToDecibels (analyse (g100, skip).rms, -120.0f);
        const float worst = juce::jmax (std::abs (r50 - r0), std::abs (r100 - r0));

        report ("T5b MORPH holds level across the sweep (no volume drop)",
                worst < 3.0f,
                juce::String ("rms: guitar ") + juce::String (r0, 1)
                    + ", morph50 " + juce::String (r50, 1)
                    + ", violin " + juce::String (r100, 1) + " dB");
    }

    // T5c — the excitation reaches the Helmholtz sawtooth target. A bowed
    // string's bridge force is a sawtooth: harmonics ~1/n, about -6 dB/octave.
    // v0.1.0 fell at -8.3 dB/oct with a -16.8 dB cliff at 800 Hz, which is why
    // it sounded dull and dead rather than bowed.
    {
        auto vln = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                   setParam (q, "output", -18.0f); });
        const int len = (int) (3.0 * kSampleRate);

        float worstStep = 0.0f;
        float prev = bandDb (vln, 200.0f, 400.0f, skip, len);
        for (int b = 1; b < 4; ++b)
        {
            const float lo = 200.0f * std::pow (2.0f, (float) b);
            const float cur = bandDb (vln, lo, lo * 2.0f, skip, len);
            worstStep = juce::jmin (worstStep, cur - prev);
            prev = cur;
        }

        report ("T5c violin spectrum has no dead octave (Helmholtz slope)",
                worstStep > -14.0f,
                juce::String ("steepest octave step ") + juce::String (worstStep, 1)
                    + " dB (target ~-6, v0.1.0 hit -16.8)");
    }

    // T6 — SWELL removes the pick attack (and only on the violin path)
    {
        auto gtr = render (p, riff, baseline);
        auto vln = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                   setParam (q, "swell", 600.0f);
                                                   setParam (q, "vibrato", 0.0f);
                                                   setParam (q, "rosin", 0.0f); });

        // Note 3 starts at 1.0 s — past both engines' settle.
        const int noteStart = (int) (1.0 * kSampleRate);
        const int window    = (int) (0.45 * kSampleRate);

        const float riseG = riseTimeMs (gtr, noteStart, window);
        const float riseV = riseTimeMs (vln, noteStart, window);
        report ("T6 SWELL slows the attack into a bow stroke",
                riseV > 60.0f && riseG < 40.0f,
                juce::String ("rise: violin ") + juce::String (riseV, 0)
                    + " ms, guitar " + juce::String (riseG, 0) + " ms");
    }

    // T7 — VIBRATO produces real frequency modulation (sidebands at 5.6 Hz)
    {
        const auto sine = makeSine (kSampleRate, 6.0, 220.0f);
        auto still = render (p, sine, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                     setParam (q, "vibrato", 0.0f);
                                                     setParam (q, "rosin", 0.0f);
                                                     setParam (q, "swell", 60.0f); });
        auto vib   = render (p, sine, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                     setParam (q, "vibrato", 100.0f);
                                                     setParam (q, "rosin", 0.0f);
                                                     setParam (q, "swell", 60.0f); });

        const int start = (int) (1.5 * kSampleRate);
        const int len   = (int) (4.0 * kSampleRate);

        auto sidebandRatioDb = [&] (const juce::AudioBuffer<float>& b)
        {
            const float carrier = goertzel (b, 220.0f, start, len);
            const float side = 0.5f * (goertzel (b, 220.0f - 6.5f, start, len)
                                       + goertzel (b, 220.0f + 6.5f, start, len));
            return juce::Decibels::gainToDecibels (side / juce::jmax (1.0e-9f, carrier), -120.0f);
        };

        const float rOff = sidebandRatioDb (still);
        const float rOn  = sidebandRatioDb (vib);
        report ("T7 VIBRATO makes 6.5 Hz sidebands appear",
                (rOn - rOff) > 10.0f && rOn > -20.0f,
                juce::String ("sideband/carrier: on ") + juce::String (rOn, 1)
                    + " dB, off " + juce::String (rOff, 1) + " dB");
    }

    // T8 — ROSIN is audible
    {
        auto dry = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                   setParam (q, "rosin", 0.0f); });
        auto wet = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                   setParam (q, "rosin", 100.0f); });
        const float d = diffDb (wet, dry, skip);
        report ("T8 ROSIN off->full is audible", d > -25.0f,
                juce::String ("difference ") + juce::String (d, 1) + " dB");
    }

    // T9 — SECTION opens the stereo field
    {
        auto solo = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                    setParam (q, "section", 0.0f); });
        auto sect = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                    setParam (q, "section", 100.0f); });

        auto correlation = [&] (const juce::AudioBuffer<float>& b)
        {
            const auto* l = b.getReadPointer (0);
            const auto* r = b.getReadPointer (1);
            double lr = 0.0, ll = 0.0, rr = 0.0;
            for (int i = skip; i < b.getNumSamples(); ++i)
            {
                lr += (double) l[i] * r[i];
                ll += (double) l[i] * l[i];
                rr += (double) r[i] * r[i];
            }
            return (float) (lr / juce::jmax (1.0e-12, std::sqrt (ll * rr)));
        };

        const float cSolo = correlation (solo);
        const float cSect = correlation (sect);
        report ("T9 SECTION decorrelates L/R", cSolo > 0.99f && cSect < 0.9f,
                juce::String ("correlation: solo ") + juce::String (cSolo, 3)
                    + ", section " + juce::String (cSect, 3));
    }

    // T10 — echo and reverb each DO something when engaged
    {
        auto dry  = render (p, riff, baseline);
        auto echo = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "echoon", 1.0f);
                                                    setParam (q, "echomix", 60.0f); });
        auto verb = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "reverbon", 1.0f);
                                                    setParam (q, "reverbmix", 60.0f); });
        const float dEcho = diffDb (echo, dry, skip);
        const float dVerb = diffDb (verb, dry, skip);
        report ("T10 ECHO and REVERB are audible when on",
                dEcho > -25.0f && dVerb > -25.0f,
                juce::String ("echo ") + juce::String (dEcho, 1)
                    + " dB, reverb " + juce::String (dVerb, 1) + " dB");
    }

    // T11 — gate closes on the floor, opens for the note
    {
        auto quiet = makeNoise (kSampleRate, 2.0, 0.002f);   // ~ -54 dBFS floor
        auto gatedNoise = render (p, quiet, [] (auto& q) { baseline (q); setParam (q, "gate", -40.0f); });
        auto openRiff   = render (p, riff,  [] (auto& q) { baseline (q); setParam (q, "gate", -40.0f); });

        const auto sNoise = analyse (gatedNoise, skip);
        const auto sRiff  = analyse (openRiff, skip);
        report ("T11 GATE mutes the floor, passes the riff",
                sNoise.rms < 2.0e-3f && sRiff.rms > 1.0e-3f,
                juce::String ("floor rms ") + juce::String (juce::Decibels::gainToDecibels (sNoise.rms, -120.0f), 1)
                    + " dB, riff rms " + juce::String (juce::Decibels::gainToDecibels (sRiff.rms, -120.0f), 1) + " dB");
    }

    // T12 — the peak-guard contract under the most hostile settings
    {
        auto hot = makeRiff (kSampleRate, 3.0, 0.95f);
        auto out = render (p, hot, [] (auto& q) { baseline (q);
                                                  setParam (q, "sustain", 100.0f);
                                                  setParam (q, "gain",   100.0f);
                                                  setParam (q, "output",  24.0f);
                                                  setParam (q, "echoon",   1.0f);
                                                  setParam (q, "echomix", 100.0f);
                                                  setParam (q, "reverbon", 1.0f);
                                                  setParam (q, "reverbmix", 100.0f); });
        const auto s = analyse (out);
        report ("T12 peak guard holds -0.2 dBFS with everything dimed",
                s.finite && s.peak <= 0.977f,
                juce::String ("peak ") + juce::String (juce::Decibels::gainToDecibels (s.peak, -120.0f), 2) + " dB");
    }

    // T13 — state save/recall round trip
    {
        TheBowottoAudioProcessor a;
        baseline (a);
        setParam (a, "morph", 73.0f);
        setParam (a, "swell", 512.0f);
        setParam (a, "body", 2.0f);
        setParam (a, "echotime", 431.0f);

        juce::MemoryBlock state;
        a.getStateInformation (state);

        TheBowottoAudioProcessor b;
        b.setStateInformation (state.getData(), (int) state.getSize());

        bool same = true;
        for (auto* id : { "morph", "swell", "body", "echotime", "sustain", "tone" })
            if (std::abs (a.apvts.getRawParameterValue (id)->load()
                          - b.apvts.getRawParameterValue (id)->load()) > 1.0e-3f)
                same = false;

        report ("T13 state save/recall round trip", same);
    }

    // T14 — block-size invariance
    {
        auto big   = render (p, riff, baseline, 512);
        auto small = render (p, riff, baseline, 64);
        const float d = diffDb (big, small, skip);
        report ("T14 output does not depend on host block size", d < -40.0f,
                juce::String ("difference ") + juce::String (d, 1) + " dB");
    }

    // T15 — alternate sample rates stay finite
    {
        bool ok = true;
        for (double sr : { 44100.0, 96000.0 })
        {
            TheBowottoAudioProcessor q;
            baseline (q);
            setParam (q, "morph", 60.0f);
            q.setRateAndBufferSizeDetails (sr, kBlockSize);
            q.prepareToPlay (sr, kBlockSize);

            auto buf = makeRiff (sr, 2.0);
            juce::MidiBuffer midi;
            for (int pos = 0; pos < buf.getNumSamples(); pos += kBlockSize)
            {
                const int len = juce::jmin (kBlockSize, buf.getNumSamples() - pos);
                juce::AudioBuffer<float> block (buf.getArrayOfWritePointers(), 2, pos, len);
                q.processBlock (block, midi);
            }
            ok = ok && analyse (buf).finite;
        }
        report ("T15 44.1k / 96k render stays finite", ok);
    }

    // T16 — MONO renders correctly, not just the right channel.
    //
    // In a mono layout outR aliases outL, so `outL[i]=l; outR[i]=r;` writes l
    // and then immediately overwrites it with r. With SECTION up (where the
    // desks differ per side) a mono host would hear only the right half of the
    // section. Nothing in the stereo-only bench could ever have caught this.
    {
        const int n = (int) (kSampleRate * 2.5);
        juce::AudioBuffer<float> stereoIn (2, n), monoIn (1, n);
        const auto riffSrc = makeRiff (kSampleRate, 2.5);
        stereoIn.makeCopyOf (riffSrc);
        monoIn.copyFrom (0, 0, riffSrc, 0, 0, n);

        auto setup = [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                    setParam (q, "section", 100.0f);
                                    setParam (q, "echoon", 0.0f);
                                    setParam (q, "reverbon", 0.0f); };

        TheBowottoAudioProcessor sp;
        auto st = render (sp, stereoIn, setup);

        TheBowottoAudioProcessor mp;
        auto mo = render (mp, monoIn, setup);

        // Build the two candidate references from the stereo render.
        juce::AudioBuffer<float> mid (1, n), rightOnly (1, n);
        for (int i = 0; i < n; ++i)
        {
            mid.setSample (0, i, 0.5f * (st.getSample (0, i) + st.getSample (1, i)));
            rightOnly.setSample (0, i, st.getSample (1, i));
        }

        const float dMid   = diffDb (mo, mid, skip);
        const float dRight = diffDb (mo, rightOnly, skip);

        report ("T16 mono render is the summed image, not one side",
                dMid < dRight,
                juce::String ("distance to mid ") + juce::String (dMid, 1)
                    + " dB vs to right-only " + juce::String (dRight, 1) + " dB");
    }

    // T17 — CHORDS do not turn to intermodulation mush.
    //
    // The bow drive is a saturator, and saturating a chord makes sum/difference
    // products that are not in either note's harmonic series. This is the
    // specific risk flagged when v0.2.0 shipped, so it gets a number.
    // Two tones a major third apart (220 / 277.18 Hz), chosen so no IMD product
    // lands on a harmonic of either note.
    {
        const int n = (int) (kSampleRate * 4.0);
        juce::AudioBuffer<float> chord (2, n);
        for (int i = 0; i < n; ++i)
        {
            const double t = i / kSampleRate;
            const float v = 0.16f * (float) (std::sin (juce::MathConstants<double>::twoPi * 220.0 * t)
                                           + std::sin (juce::MathConstants<double>::twoPi * 277.18 * t));
            chord.setSample (0, i, v);
            chord.setSample (1, i, v);
        }

        auto vln = render (p, chord, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                    setParam (q, "rosin", 0.0f);
                                                    setParam (q, "vibrato", 0.0f);
                                                    setParam (q, "section", 0.0f);
                                                    setParam (q, "swell", 60.0f);
                                                    setParam (q, "output", -18.0f); });
        const int start = (int) (1.0 * kSampleRate), len = (int) (2.5 * kSampleRate);

        auto energyAt = [&] (std::initializer_list<float> freqs)
        {
            double sum = 0.0;
            for (float f : freqs)
            {
                const float m = goertzel (vln, f, start, len);
                sum += (double) m * m;
            }
            return 10.0f * (float) std::log10 (juce::jmax (1.0e-18, sum));
        };

        // Musical content: the two fundamentals and their own harmonics.
        const float harmonic = energyAt ({ 220.0f, 277.18f, 440.0f, 554.36f, 660.0f, 831.54f });
        // Non-harmonic intermodulation products.
        const float imd      = energyAt ({ 57.18f, 162.82f, 334.36f, 497.18f, 719.18f, 940.72f });

        report ("T17 chord: harmonics still dominate intermodulation",
                (harmonic - imd) > 6.0f,
                juce::String ("harmonics beat IMD by ") + juce::String (harmonic - imd, 1) + " dB");
    }

    // T18 — the BOW knob works across its WHOLE sweep, not just the top half.
    // v0.2.0 lowered the drive floor for exactly this reason; without a test
    // the bottom of the knob can silently go back to doing nothing.
    {
        const int len = (int) (2.5 * kSampleRate);
        float prev = -1000.0f;
        bool monotonic = true;
        float lo = 0.0f, hi = 0.0f;

        for (int i = 0; i <= 4; ++i)
        {
            const float f = 25.0f * (float) i;
            auto out = render (p, riff, [f] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                        setParam (q, "force", f);
                                                        setParam (q, "rosin", 0.0f);
                                                        setParam (q, "output", -18.0f); });
            // Brightness proxy: upper-band energy relative to the fundamentals.
            const float bright = bandDb (out, 1200.0f, 4800.0f, skip, len)
                                 - bandDb (out, 120.0f, 480.0f, skip, len);
            if (i == 0) lo = bright;
            if (i == 4) hi = bright;
            if (bright < prev - 0.5f) monotonic = false;
            prev = bright;
        }

        report ("T18 BOW force sweeps brightness monotonically, useful range",
                monotonic && (hi - lo) > 6.0f,
                juce::String ("brightness BOW 0 -> 100: ") + juce::String (lo, 1)
                    + " -> " + juce::String (hi, 1) + " dB, span " + juce::String (hi - lo, 1));
    }

    // T19 — the BODY selector really swaps the instrument. Violin / viola /
    // cello have different signature modes; if the combo stopped reaching the
    // body model, every setting would sound identical and nothing else here
    // would notice.
    {
        const int len = (int) (3.0 * kSampleRate);
        auto renderBody = [&] (float body)
        {
            return render (p, noise, [body] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                        setParam (q, "body", body);
                                                        setParam (q, "rosin", 0.0f);
                                                        setParam (q, "swell", 60.0f);
                                                        setParam (q, "output", -18.0f); });
        };
        auto violin = renderBody (0.0f);
        auto cello  = renderBody (2.0f);

        auto at = [&] (const juce::AudioBuffer<float>& b, float hz)
        { return juce::Decibels::gainToDecibels (goertzel (b, hz, skip, len), -140.0f); };

        // Violin's hill (2.3 kHz) is a stronger discriminator than a shared
        // signature-mode frequency: at 225 Hz (cello's B1+) both bodies hit the
        // same envelope FLOOR clamp and read equal, which is what the first
        // draft of this test tripped on. lowRolloff is the clean, physical
        // separator instead — a violin's body genuinely cannot radiate below
        // 190 Hz, a cello's floor is 60 Hz, so at 95 Hz only the cello has
        // anything to say.
        const float celloLow    = at (cello, 95.0f)  - at (violin, 95.0f);
        const float violinHill  = at (violin, 2300.0f) - at (cello, 2300.0f);

        report ("T19 BODY selects a different instrument body",
                celloLow > 6.0f && violinHill > 3.0f,
                juce::String ("95 Hz favours cello by ") + juce::String (celloLow, 1)
                    + " dB; 2300 Hz favours violin by " + juce::String (violinHill, 1) + " dB");
    }

    // T20 — BYPASS is bit-transparent, not merely "quiet".
    {
        auto out = render (p, riff, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                   setParam (q, "bypass", 1.0f); });
        const float d = diffDb (out, riff, 0);
        report ("T20 BYPASS passes the input untouched", d < -100.0f,
                juce::String ("difference from input ") + juce::String (d, 1) + " dB");
    }

    // T21 — reported latency matches the GUITAR path's real latency. Hosts use
    // this for delay compensation, so a wrong number drags a tracked guitar out
    // of time with the rest of the session.
    {
        TheBowottoAudioProcessor q;
        baseline (q);
        setParam (q, "morph", 0.0f);
        setParam (q, "muffon", 0.0f);
        q.setRateAndBufferSizeDetails (kSampleRate, kBlockSize);
        q.prepareToPlay (kSampleRate, kBlockSize);

        const int reported = q.getLatencySamples();

        const int n = kBlockSize * 8;
        juce::AudioBuffer<float> imp (2, n);
        imp.clear();
        imp.setSample (0, kBlockSize, 0.5f);
        imp.setSample (1, kBlockSize, 0.5f);

        juce::MidiBuffer midi;
        for (int pos = 0; pos < n; pos += kBlockSize)
        {
            juce::AudioBuffer<float> blk (imp.getArrayOfWritePointers(), 2, pos, kBlockSize);
            q.processBlock (blk, midi);
        }

        int peakAt = 0;
        float peak = 0.0f;
        for (int i = 0; i < n; ++i)
            if (std::abs (imp.getSample (0, i)) > peak)
            { peak = std::abs (imp.getSample (0, i)); peakAt = i; }

        const int measured = peakAt - kBlockSize;
        report ("T21 reported latency matches the guitar path",
                std::abs (measured - reported) <= 8,
                juce::String ("reported ") + juce::String (reported)
                    + ", measured " + juce::String (measured) + " samples");
    }

    // T22 — slamming parameters mid-stream does not click. Every control is
    // smoothed; a missed smoother shows up as a step discontinuity.
    {
        TheBowottoAudioProcessor q;
        baseline (q);
        q.setRateAndBufferSizeDetails (kSampleRate, kBlockSize);
        q.prepareToPlay (kSampleRate, kBlockSize);

        auto buf = makeRiff (kSampleRate, 3.0);
        juce::MidiBuffer midi;
        // OUTPUT excluded: its +-24 dB range (a ~250x span) applied to already-
        // saturated broadband content legitimately swings the full softLimit
        // ceiling (-0.97..0.97) on adjacent samples with NO automation at all
        // (verified via --debugnoslam: pinning output at +24dB alone produces
        // the identical ~1.94 delta). That is loud audio, not a smoothing bug
        // -- a global max-delta test can't tell those apart for a wide-range
        // gain control, so it isn't a fair click probe for this one parameter.
        const char* slam[] = { "morph", "force", "sustain", "tone", "scoop", "gain",
                               "vibrato", "rosin", "section" };
        constexpr int slamCount = 9;
        int idx = 0;
        float worstStep = 0.0f;
        float last = 0.0f;
        bool first = true;

        for (int pos = 0; pos + kBlockSize <= buf.getNumSamples(); pos += kBlockSize)
        {
            // Jump one parameter to an extreme every block.
            if (auto* param = q.apvts.getParameter (slam[idx % slamCount]))
                param->setValueNotifyingHost ((idx % 2) ? 1.0f : 0.0f);
            ++idx;

            juce::AudioBuffer<float> blk (buf.getArrayOfWritePointers(), 2, pos, kBlockSize);
            q.processBlock (blk, midi);

            const auto* d = blk.getReadPointer (0);
            for (int i = 0; i < kBlockSize; ++i)
            {
                if (! first)
                    worstStep = juce::jmax (worstStep, std::abs (d[i] - last));
                last = d[i];
                first = false;
            }
        }

        report ("T22 parameter slams do not click", worstStep < 0.35f,
                juce::String ("largest sample step ") + juce::String (worstStep, 3));
    }

    std::cout << "\n" << (gFailures == 0 ? "ALL PASS" : juce::String (gFailures) + " FAILURE(S)")
              << "\n";
}

//==============================================================================
static int runSoak (int seconds)
{
    TheBowottoAudioProcessor p;
    baseline (p);
    p.setRateAndBufferSizeDetails (kSampleRate, kBlockSize);
    p.prepareToPlay (kSampleRate, kBlockSize);

    juce::Random rng (1234);
    juce::MidiBuffer midi;
    const auto riff = makeRiff (kSampleRate, 4.0);
    int pos = 0;
    long blocks = 0;

    const auto start = std::chrono::steady_clock::now();
    const char* ids[] = { "gate", "muffon", "sustain", "tone", "scoop", "gain",
                          "morph", "swell", "vibrato", "rosin", "section", "body",
                          "echoon", "echotime", "echofb", "echomix",
                          "reverbon", "reverbsize", "reverbmix", "output" };

    while (std::chrono::duration_cast<std::chrono::seconds> (
               std::chrono::steady_clock::now() - start).count() < seconds)
    {
        // Random parameter stabs.
        if (rng.nextInt (4) == 0)
            if (auto* param = p.apvts.getParameter (ids[(size_t) rng.nextInt (20)]))
                param->setValueNotifyingHost (rng.nextFloat());

        // Random block sizes; occasional re-prepare at a random rate.
        if (rng.nextInt (2000) == 0)
        {
            const double sr = rng.nextBool() ? 44100.0 : (rng.nextBool() ? 48000.0 : 96000.0);
            p.prepareToPlay (sr, kBlockSize);
        }

        const int len = 16 + rng.nextInt (kBlockSize - 16);
        if (pos + len >= riff.getNumSamples())
            pos = 0;

        juce::AudioBuffer<float> block (2, len);
        for (int ch = 0; ch < 2; ++ch)
            block.copyFrom (ch, 0, riff, ch, pos, len);
        pos += len;

        p.processBlock (block, midi);
        ++blocks;

        const auto s = analyse (block);
        if (! s.finite || s.peak > 4.0f)
        {
            std::cout << "SOAK FAIL after " << blocks << " blocks (peak "
                      << s.peak << ", finite " << s.finite << ")\n";
            return 1;
        }
    }

    std::cout << "SOAK OK: " << blocks << " blocks, " << seconds << " s, no NaN, no runaway\n";
    return 0;
}

//==============================================================================
static int runRender (const char* inPath, const char* outPath, float gainDb)
{
    juce::AudioFormatManager fm;
    fm.registerBasicFormats();

    const juce::File inFile = juce::File::getCurrentWorkingDirectory()
                                  .getChildFile (juce::String (inPath));
    std::unique_ptr<juce::AudioFormatReader> reader (fm.createReaderFor (inFile));
    if (reader == nullptr)
    {
        std::cerr << "cannot read " << inPath << "\n";
        return 1;
    }

    juce::AudioBuffer<float> buf (2, (int) reader->lengthInSamples);
    reader->read (&buf, 0, (int) reader->lengthInSamples, 0, true, reader->numChannels > 1);
    if (reader->numChannels == 1)
        buf.copyFrom (1, 0, buf, 0, 0, buf.getNumSamples());
    buf.applyGain (juce::Decibels::decibelsToGain (gainDb));

    TheBowottoAudioProcessor p;
    baseline (p);
    const double sr = reader->sampleRate;
    p.setRateAndBufferSizeDetails (sr, kBlockSize);
    p.prepareToPlay (sr, kBlockSize);

    juce::MidiBuffer midi;
    for (int pos = 0; pos < buf.getNumSamples(); pos += kBlockSize)
    {
        const int len = juce::jmin (kBlockSize, buf.getNumSamples() - pos);
        juce::AudioBuffer<float> block (buf.getArrayOfWritePointers(), 2, pos, len);
        p.processBlock (block, midi);
    }

    const auto s = analyse (buf);
    std::cout << "rendered: rms " << juce::Decibels::gainToDecibels (s.rms, -120.0f)
              << " dB, peak " << juce::Decibels::gainToDecibels (s.peak, -120.0f) << " dB\n";

    const juce::File outFile = juce::File::getCurrentWorkingDirectory()
                                   .getChildFile (juce::String (outPath));
    outFile.deleteFile();
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatWriter> writer (
        wav.createWriterFor (new juce::FileOutputStream (outFile), sr, 2, 24, {}, 0));
    if (writer == nullptr)
    {
        std::cerr << "cannot write " << outPath << "\n";
        return 1;
    }
    writer->writeFromAudioSampleBuffer (buf, 0, buf.getNumSamples());
    std::cout << "wrote " << outFile.getFullPathName() << "\n";
    return 0;
}

//==============================================================================
/** Realtime factor: one stereo instance on the synthetic riff at 48k/512. */
static int runCpu()
{
    struct Config { const char* name; float morph, section, echo; };
    const Config configs[] = {
        { "guitar only        ", 0.0f,   0.0f, 0.0f },
        { "morph 50           ", 50.0f,  0.0f, 0.0f },
        { "full violin+section", 100.0f, 100.0f, 0.0f },
        { "everything on      ", 100.0f, 100.0f, 1.0f },
    };

    for (const auto& c : configs)
    {
        TheBowottoAudioProcessor p;
        baseline (p);
        setParam (p, "morph", c.morph);
        setParam (p, "section", c.section);
        setParam (p, "echoon", c.echo);
        setParam (p, "reverbon", c.echo);
        p.setRateAndBufferSizeDetails (kSampleRate, kBlockSize);
        p.prepareToPlay (kSampleRate, kBlockSize);

        auto buf = makeRiff (kSampleRate, 10.0);
        juce::MidiBuffer midi;

        const auto t0 = std::chrono::steady_clock::now();
        for (int pos = 0; pos + kBlockSize <= buf.getNumSamples(); pos += kBlockSize)
        {
            juce::AudioBuffer<float> block (buf.getArrayOfWritePointers(), 2, pos, kBlockSize);
            p.processBlock (block, midi);
        }
        const auto us = std::chrono::duration_cast<std::chrono::microseconds> (
                            std::chrono::steady_clock::now() - t0).count();

        const double audioSec = buf.getNumSamples() / kSampleRate;
        printf ("%s  %.1fx realtime  (%.2f%% of one core)\n",
                c.name, audioSec / (us * 1.0e-6), 100.0 * (us * 1.0e-6) / audioSec);
    }
    return 0;
}

/** Renders the internal riff at three MORPH settings to WAVs — a preview
    listen without touching any session audio. */
static int runDemo (const char* prefix)
{
    struct Shot { const char* suffix; float morph, section, swell, force, vib; };
    const Shot shots[] = {
        { "1-guitar",       0.0f,   0.0f, 300.0f, 55.0f, 45.0f },
        { "2-morph50",     50.0f,  40.0f, 400.0f, 55.0f, 45.0f },
        { "3-violin-solo",100.0f,   0.0f, 450.0f, 55.0f, 55.0f },
        { "4-violin-sect",100.0f, 100.0f, 500.0f, 45.0f, 50.0f },
        { "5-bow-soft",   100.0f,  60.0f, 500.0f, 10.0f, 50.0f },
        { "6-bow-hard",   100.0f,  60.0f, 500.0f, 100.0f, 50.0f },
    };

    juce::WavAudioFormat wav;
    for (const auto& shot : shots)
    {
        TheBowottoAudioProcessor p;
        const auto riff = makeRiff (kSampleRate, 8.0);
        auto out = render (p, riff, [&shot] (auto& q)
        {
            baseline (q);
            setParam (q, "morph", shot.morph);
            setParam (q, "section", shot.section);
            setParam (q, "swell", shot.swell);
            setParam (q, "force", shot.force);
            setParam (q, "vibrato", shot.vib);
            setParam (q, "reverbon", shot.morph > 0.0f ? 1.0f : 0.0f);
            setParam (q, "reverbmix", 22.0f);
        });
        const auto st = analyse (out, (int) (0.5 * kSampleRate));
        printf ("  %-14s rms %6.1f dB  peak %6.1f dB\n", shot.suffix,
                juce::Decibels::gainToDecibels (st.rms, -120.0f),
                juce::Decibels::gainToDecibels (st.peak, -120.0f));

        const juce::File f = juce::File::getCurrentWorkingDirectory()
            .getChildFile (juce::String (prefix) + "-" + shot.suffix + ".wav");
        f.deleteFile();
        std::unique_ptr<juce::AudioFormatWriter> w (
            wav.createWriterFor (new juce::FileOutputStream (f), kSampleRate, 2, 24, {}, 0));
        if (w == nullptr)
            return 1;
        w->writeFromAudioSampleBuffer (out, 0, out.getNumSamples());
        std::cout << "wrote " << f.getFullPathName() << "\n";
    }
    return 0;
}

/** Which band best separates the violin body from the guitar cab? */
static int runBands()
{
    TheBowottoAudioProcessor p;
    const auto noise = makeNoise (kSampleRate, 4.0);
    const int skip = (int) (0.5 * kSampleRate), len = (int) (3.0 * kSampleRate);

    auto gtr = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "output", -18.0f); });
    auto vln = render (p, noise, [] (auto& q) { baseline (q); setParam (q, "morph", 100.0f);
                                                setParam (q, "rosin", 0.0f);
                                                setParam (q, "swell", 60.0f);
                                                setParam (q, "output", -18.0f); });
    struct B { const char* name; float lo, hi; };
    const B hills[] = { {"2000-3000", 2000, 3000}, {"2200-3200", 2200, 3200},
                        {"2000-2600", 2000, 2600}, {"2600-3600", 2600, 3600} };
    const B valley = {"700-1500", 700, 1500};

    const float vg = bandDb (gtr, valley.lo, valley.hi, skip, len);
    const float vv = bandDb (vln, valley.lo, valley.hi, skip, len);
    printf ("valley %s: guitar %.1f  violin %.1f\n", valley.name, vg, vv);
    for (const auto& h : hills)
    {
        const float hg = bandDb (gtr, h.lo, h.hi, skip, len) - vg;
        const float hv = bandDb (vln, h.lo, h.hi, skip, len) - vv;
        printf ("hill %-10s  guitar %6.1f  violin %6.1f   separation %5.1f dB\n",
                h.name, hg, hv, hv - hg);
    }
    // Signature modes: violin-specific, well below the cab's lift.
    for (float f : { 272.0f, 462.0f, 551.0f })
    {
        const float a = juce::Decibels::gainToDecibels (goertzel (gtr, f, skip, len), -140.0f);
        const float b = juce::Decibels::gainToDecibels (goertzel (vln, f, skip, len), -140.0f);
        printf ("mode %5.0f Hz  guitar %6.1f  violin %6.1f\n", f, a, b);
    }
    return 0;
}

/** Stage-by-stage RMS through the violin engine, to find where level dies. */
static int runStages()
{
    const auto riff = makeRiff (kSampleRate, 3.0);
    const auto* in = riff.getReadPointer (0);
    const int n = riff.getNumSamples();
    const int skip = (int) (0.5 * kSampleRate);

    bowotto::Swell       swell;      swell.prepare (kSampleRate);
    bowotto::BowDrive    drive;      drive.prepare (kSampleRate);
    bowotto::Vibrato     vib;        vib.prepare (kSampleRate);
    bowotto::Rosin       rosin;      rosin.prepare (kSampleRate);
    bowotto::BodyModel   body;       body.prepare (kSampleRate);
    bowotto::OnePoleHP   pre;        pre.prepare (kSampleRate, 60.0f);

    double aIn=0, aPre=0, aComp=0, aSwell=0, aVib=0, aRosin=0, aBody=0;
    int cnt=0;
    for (int i = 0; i < n; ++i)
    {
        const float x0 = in[i];
        const float x  = pre.process (x0);
        const float g  = swell.process (x, 300.0f);
        const float c  = drive.process (x, 0.55f);
        const float sw = c * g;
        const float v  = vib.process (sw, 0.45f);
        const float r  = v + rosin.process (v, 0.30f);
        const float b  = body.process (r);

        if (i >= skip)
        {
            aIn+= (double)x0*x0; aPre+= (double)x*x; aComp+= (double)c*c;
            aSwell+= (double)sw*sw; aVib+= (double)v*v; aRosin+= (double)r*r;
            aBody+= (double)b*b; ++cnt;
        }
    }
    auto db=[&](double a){ return juce::Decibels::gainToDecibels ((float) std::sqrt (a/cnt), -140.0f); };
    printf ("input      %7.1f dB\n", db(aIn));
    printf ("after HP   %7.1f dB\n", db(aPre));
    printf ("after DRIVE%7.1f dB\n", db(aComp));
    printf ("after SWELL%7.1f dB\n", db(aSwell));
    printf ("after VIB  %7.1f dB\n", db(aVib));
    printf ("after ROSIN%7.1f dB\n", db(aRosin));
    printf ("after BODY %7.1f dB   <-- the body's own gain\n", db(aBody));
    return 0;
}

/** Diagnose the morph: level and harmonic slope, guitar vs violin path. */
static int runDiagnose()
{
    TheBowottoAudioProcessor p;
    const auto riff = makeRiff (kSampleRate, 4.0);
    const int skip = (int) (0.5 * kSampleRate);
    const int len  = (int) (3.0 * kSampleRate);

    for (float m : { 0.0f, 50.0f, 100.0f })
    {
        // -18 dB of output so the peak guard never engages: with it limiting,
        // every setting reads -0.3 dB peak and the comparison is meaningless.
        auto out = render (p, riff, [m] (auto& q) { baseline (q); setParam (q, "morph", m);
                                                    setParam (q, "output", -18.0f); });
        const auto st = analyse (out, skip);

        // Harmonic slope: energy per octave band, 200 Hz .. 6.4 kHz
        printf ("MORPH %5.0f  rms %6.1f dB  peak %6.1f dB   bands:",
                m, juce::Decibels::gainToDecibels (st.rms, -120.0f),
                juce::Decibels::gainToDecibels (st.peak, -120.0f));
        for (int b = 0; b < 6; ++b)
        {
            const float lo = 100.0f * std::pow (2.0f, (float) b);
            printf (" %.0f:%5.1f", lo, bandDb (out, lo, lo * 2.0f, skip, len));
        }
        printf ("\n");
    }
    return 0;
}

int main (int argc, char* argv[])
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    if (argc >= 2 && juce::String (argv[1]) == "--bands")
        return runBands();

    if (argc >= 2 && juce::String (argv[1]) == "--stages")
        return runStages();

    if (argc >= 2 && juce::String (argv[1]) == "--diagnose")
        return runDiagnose();

    if (argc >= 2 && juce::String (argv[1]) == "--cpu")
        return runCpu();

    if (argc >= 3 && juce::String (argv[1]) == "--demo")
        return runDemo (argv[2]);

    if (argc >= 4 && juce::String (argv[1]) == "--render")
        return runRender (argv[2], argv[3], argc > 4 ? (float) atof (argv[4]) : 0.0f);

    if (argc >= 3 && juce::String (argv[1]) == "--soak")
        return runSoak (atoi (argv[2]));

    runBench();
    return gFailures == 0 ? 0 : 1;
}
