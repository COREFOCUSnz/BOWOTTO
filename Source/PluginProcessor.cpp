#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
namespace
{
    // Simple autocorrelation-based pitch detector for tuner display.
    // Returns the detected fundamental frequency in Hz, or 0 if uncertain.
    float detectFundamental (const float* audio, int numSamples, double sampleRate)
    {
        if (numSamples < 256)
            return 0.0f;

        const int minPeriod = (int) (sampleRate / 1000.0);  // 1 kHz max
        const int maxPeriod = (int) (sampleRate / 40.0);    // 40 Hz min (low E on guitar)

        float bestCorr = 0.0f;
        int bestLag = 0;

        for (int lag = minPeriod; lag <= maxPeriod && lag < numSamples / 2; ++lag)
        {
            float corr = 0.0f, energy = 0.0f;
            for (int i = 0; i < numSamples - lag; ++i)
            {
                corr += audio[i] * audio[i + lag];
                energy += audio[i] * audio[i];
            }
            if (energy > 1.0e-6f && corr / energy > bestCorr)
            {
                bestCorr = corr / energy;
                bestLag = lag;
            }
        }

        if (bestCorr < 0.3f || bestLag == 0)
            return 0.0f;

        return (float) (sampleRate / bestLag);
    }

    // Convert frequency to MIDI note number (A4 = 69, middle C = 60).
    float freqToMidi (float hz)
    {
        if (hz <= 0.0f)
            return -1.0f;
        return 69.0f + 12.0f * std::log2 (hz / 440.0f);
    }

    // Tempo-sync note divisions, shared by PHASER/CHORUS rate and ECHO time.
    // Each entry's length is expressed in quarter notes so both a synced LFO
    // rate (Hz) and a synced delay time (ms) fall out of the same table.
    const juce::StringArray& divisionChoiceList()
    {
        static const juce::StringArray choices {
            "1/1", "1/2", "1/2D", "1/4", "1/4D", "1/4T",
            "1/8", "1/8D", "1/8T", "1/16", "1/16D", "1/16T", "1/32"
        };
        return choices;
    }

    constexpr float kDivisionQuarterLen[] = {
        4.0f, 2.0f, 3.0f, 1.0f, 1.5f, 2.0f / 3.0f,
        0.5f, 0.75f, 1.0f / 3.0f, 0.25f, 0.375f, 1.0f / 6.0f, 0.125f
    };

    float divisionToSeconds (int index, double bpm)
    {
        index = juce::jlimit (0, (int) (sizeof (kDivisionQuarterLen) / sizeof (float)) - 1, index);
        const float quarterSeconds = 60.0f / (float) juce::jmax (1.0, bpm);
        return quarterSeconds * kDivisionQuarterLen[(size_t) index];
    }

    float divisionToHz (int index, double bpm)
    {
        return 1.0f / juce::jmax (0.001f, divisionToSeconds (index, bpm));
    }

    float divisionToMs (int index, double bpm)
    {
        return divisionToSeconds (index, bpm) * 1000.0f;
    }
}

//==============================================================================
juce::AudioProcessorValueTreeState::ParameterLayout
TheBowottoAudioProcessor::createParameterLayout()
{
    using P  = juce::AudioParameterFloat;
    using B  = juce::AudioParameterBool;
    using C  = juce::AudioParameterChoice;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    auto range = [] (float lo, float hi, float step = 0.0f)
    {
        return juce::NormalisableRange<float> (lo, hi, step);
    };

    // --- front end
    params.push_back (std::make_unique<P> ("gate",    "GATE",    range (-80.0f, -30.0f), -72.0f));

    // --- the Muff
    params.push_back (std::make_unique<B> ("muffon",  "MUFF",    true));
    params.push_back (std::make_unique<P> ("sustain", "SUSTAIN", range (0.0f, 100.0f),   65.0f));
    params.push_back (std::make_unique<P> ("tone",    "TONE",    range (0.0f, 100.0f),   50.0f));
    params.push_back (std::make_unique<P> ("scoop",   "SCOOP",   range (0.0f, 100.0f),  100.0f));

    // --- the amp
    params.push_back (std::make_unique<P> ("gain",    "GAIN",    range (0.0f, 100.0f),   20.0f));

    // --- the violin
    params.push_back (std::make_unique<P> ("morph",   "MORPH",   range (0.0f, 100.0f),    0.0f));
    params.push_back (std::make_unique<P> ("swell",   "SWELL",   range (60.0f, 1200.0f), 300.0f));
    params.push_back (std::make_unique<P> ("vibrato", "VIBRATO", range (0.0f, 100.0f),   45.0f));
    params.push_back (std::make_unique<P> ("rosin",   "ROSIN",   range (0.0f, 100.0f),   30.0f));
    params.push_back (std::make_unique<P> ("section", "SECTION", range (0.0f, 100.0f),    0.0f));
    // Bow force: the primary brightness control on a real violin (Schelleng).
    params.push_back (std::make_unique<P> ("force",   "BOW",     range (0.0f, 100.0f),   55.0f));
    params.push_back (std::make_unique<C> ("body",    "BODY",
        juce::StringArray { "VIOLIN", "VIOLA", "CELLO" }, 0));

    // --- phaser
    params.push_back (std::make_unique<B> ("phaseron",   "PHASER",      false));
    params.push_back (std::make_unique<P> ("phaserrate", "PHASER RATE", range (0.05f, 6.0f),  0.6f));
    params.push_back (std::make_unique<P> ("phaserdepth","PHASER DEPTH",range (0.0f, 100.0f), 65.0f));
    params.push_back (std::make_unique<P> ("phasermix",  "PHASER MIX",  range (0.0f, 100.0f), 50.0f));
    params.push_back (std::make_unique<B> ("phasersync",     "PHASER SYNC", false));
    params.push_back (std::make_unique<C> ("phaserdivision", "PHASER DIV",  divisionChoiceList(), 3));

    // --- chorus (voices-in-unison shimmer)
    params.push_back (std::make_unique<B> ("choruson",   "CHORUS",        false));
    params.push_back (std::make_unique<P> ("chorusrate", "CHORUS RATE",   range (0.05f, 2.0f),   0.8f));
    params.push_back (std::make_unique<P> ("chorusdepth","CHORUS DEPTH",  range (0.0f, 100.0f),  60.0f));
    params.push_back (std::make_unique<P> ("chorusmix",  "CHORUS MIX",    range (0.0f, 100.0f),  50.0f));
    params.push_back (std::make_unique<B> ("chorussync",     "CHORUS SYNC", false));
    params.push_back (std::make_unique<C> ("chorusdivision", "CHORUS DIV",  divisionChoiceList(), 3));

    // --- tape echo
    params.push_back (std::make_unique<B> ("echoon",   "ECHO",      false));
    params.push_back (std::make_unique<P> ("echotime", "ECHO TIME", range (80.0f, 900.0f), 380.0f));
    params.push_back (std::make_unique<P> ("echofb",   "ECHO FB",   range (0.0f, 70.0f),    35.0f));
    params.push_back (std::make_unique<P> ("echomix",  "ECHO MIX",  range (0.0f, 100.0f),   25.0f));
    params.push_back (std::make_unique<B> ("echosync",     "ECHO SYNC", false));
    params.push_back (std::make_unique<C> ("echodivision", "ECHO DIV",  divisionChoiceList(), 3));

    // --- tremolo
    params.push_back (std::make_unique<B> ("tremoloon",    "TREMOLO",       false));
    params.push_back (std::make_unique<P> ("tremolorate",  "TREMOLO RATE",  range (0.5f, 12.0f),  4.5f));
    params.push_back (std::make_unique<P> ("tremolodepth", "TREMOLO DEPTH", range (0.0f, 100.0f), 55.0f));

    // --- reverb
    params.push_back (std::make_unique<B> ("reverbon",   "REVERB",      false));
    params.push_back (std::make_unique<P> ("reverbsize", "REVERB SIZE", range (0.0f, 100.0f), 55.0f));
    params.push_back (std::make_unique<P> ("reverbmix",  "REVERB MIX",  range (0.0f, 100.0f), 25.0f));

    // --- back end
    params.push_back (std::make_unique<P> ("output", "OUTPUT", range (-24.0f, 24.0f), 0.0f));
    params.push_back (std::make_unique<B> ("bypass", "BYPASS", false));

    return { params.begin(), params.end() };
}

//==============================================================================
TheBowottoAudioProcessor::TheBowottoAudioProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "PARAMS", createParameterLayout())
{
    bypassParam = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));

    pGate       = apvts.getRawParameterValue ("gate");
    pMuffOn     = apvts.getRawParameterValue ("muffon");
    pSustain    = apvts.getRawParameterValue ("sustain");
    pTone       = apvts.getRawParameterValue ("tone");
    pScoop      = apvts.getRawParameterValue ("scoop");
    pGain       = apvts.getRawParameterValue ("gain");
    pMorph      = apvts.getRawParameterValue ("morph");
    pSwell      = apvts.getRawParameterValue ("swell");
    pVibrato    = apvts.getRawParameterValue ("vibrato");
    pRosin      = apvts.getRawParameterValue ("rosin");
    pSection    = apvts.getRawParameterValue ("section");
    pForce      = apvts.getRawParameterValue ("force");
    pBody       = apvts.getRawParameterValue ("body");
    pPhaserOn    = apvts.getRawParameterValue ("phaseron");
    pPhaserRate  = apvts.getRawParameterValue ("phaserrate");
    pPhaserDepth = apvts.getRawParameterValue ("phaserdepth");
    pPhaserMix   = apvts.getRawParameterValue ("phasermix");
    pPhaserSync     = apvts.getRawParameterValue ("phasersync");
    pPhaserDivision = apvts.getRawParameterValue ("phaserdivision");
    pChorusOn    = apvts.getRawParameterValue ("choruson");
    pChorusRate  = apvts.getRawParameterValue ("chorusrate");
    pChorusDepth = apvts.getRawParameterValue ("chorusdepth");
    pChorusMix   = apvts.getRawParameterValue ("chorusmix");
    pChorusSync     = apvts.getRawParameterValue ("chorussync");
    pChorusDivision = apvts.getRawParameterValue ("chorusdivision");
    pEchoOn     = apvts.getRawParameterValue ("echoon");
    pEchoTime   = apvts.getRawParameterValue ("echotime");
    pEchoFb     = apvts.getRawParameterValue ("echofb");
    pEchoMix    = apvts.getRawParameterValue ("echomix");
    pEchoSync     = apvts.getRawParameterValue ("echosync");
    pEchoDivision = apvts.getRawParameterValue ("echodivision");
    pTremoloOn    = apvts.getRawParameterValue ("tremoloon");
    pTremoloRate  = apvts.getRawParameterValue ("tremolorate");
    pTremoloDepth = apvts.getRawParameterValue ("tremolodepth");
    pReverbOn   = apvts.getRawParameterValue ("reverbon");
    pReverbSize = apvts.getRawParameterValue ("reverbsize");
    pReverbMix  = apvts.getRawParameterValue ("reverbmix");
    pOutput     = apvts.getRawParameterValue ("output");
}

//==============================================================================
bool TheBowottoAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& in  = layouts.getMainInputChannelSet();
    const auto& out = layouts.getMainOutputChannelSet();

    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    if (in != juce::AudioChannelSet::mono() && in != juce::AudioChannelSet::stereo())
        return false;

    return true;
}

//==============================================================================
void TheBowottoAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;

    gate.prepare (sampleRate);
    violin.prepare (sampleRate);
    echoL.prepare (sampleRate);
    echoR.prepare (sampleRate);
    tremolo.prepare (sampleRate);

    const juce::dsp::ProcessSpec fxSpec { sampleRate, (juce::uint32) samplesPerBlock, 2 };
    phaser.prepare (fxSpec);
    phaser.setCentreFrequency (1000.0f);
    phaser.setFeedback (0.5f);
    chorus.prepare (fxSpec);

    oversampler.initProcessing ((size_t) samplesPerBlock);
    oversampler.reset();
    const double osRate = sampleRate * 4.0;
    muff.prepare (osRate);
    amp.prepare (osRate);

    cab.prepare ({ sampleRate, (juce::uint32) samplesPerBlock, 1 });
    cab.loadImpulseResponse (bowotto::CabIR::build (sampleRate), sampleRate,
                             juce::dsp::Convolution::Stereo::no,
                             juce::dsp::Convolution::Trim::no,
                             juce::dsp::Convolution::Normalise::no);

    reverb.setSampleRate (sampleRate);

    monoBuffer .setSize (1, samplesPerBlock);
    guitarBuffer.setSize (1, samplesPerBlock);
    violinL.setSize (1, samplesPerBlock);
    violinR.setSize (1, samplesPerBlock);

    const double ramp = 0.02;
    for (auto* s : { &smMorph, &smSustain, &smTone, &smScoop, &smDrive,
                     &smSwell, &smVibrato, &smRosin, &smSection, &smForce,
                     &smPhaserRate, &smPhaserDepth, &smPhaserMix,
                     &smChorusRate, &smChorusDepth, &smChorusMix,
                     &smEchoTime, &smEchoFb, &smEchoMix,
                     &smTremoloRate, &smTremoloDepth,
                     &smReverbMix, &smOutput })
        s->reset (sampleRate, ramp);

    // Seed every smoother to its REAL current value. reset() alone leaves
    // currentValue at the SmoothedValue's default of 0 until the next
    // setTargetValue() call ramps it in over 20 ms — which for smDrive means
    // "drive" genuinely passes through exactly 0 on every fresh prepare (host
    // load, sample-rate change). VintageAmp::shape() divides by tanh(drive),
    // so that ramp-through-zero was a real 0/0 = NaN that then lived forever
    // in the DC blockers' IIR state (linear recursion never clears NaN on its
    // own). Found by T16's mono test, which happened to be the first bench
    // test to construct a processor and never warm it up with a T1-style
    // all-silence block first — but the bug hits ANY real host on first load.
    smMorph    .setCurrentAndTargetValue (pMorph->load()    * 0.01f);
    smSustain  .setCurrentAndTargetValue (pSustain->load()  * 0.01f);
    smTone     .setCurrentAndTargetValue (pTone->load()     * 0.01f);
    smScoop    .setCurrentAndTargetValue (pScoop->load()    * 0.01f);
    smDrive    .setCurrentAndTargetValue (1.0f + pGain->load() * 0.09f);
    smSwell    .setCurrentAndTargetValue (pSwell->load());
    smVibrato  .setCurrentAndTargetValue (pVibrato->load()  * 0.01f);
    smRosin    .setCurrentAndTargetValue (pRosin->load()    * 0.01f);
    smSection  .setCurrentAndTargetValue (pSection->load()  * 0.01f);
    smForce    .setCurrentAndTargetValue (pForce->load()    * 0.01f);
    smEchoTime .setCurrentAndTargetValue (pEchoTime->load());
    smEchoFb   .setCurrentAndTargetValue (pEchoFb->load()   * 0.01f);
    smEchoMix  .setCurrentAndTargetValue (pEchoMix->load()  * 0.01f);
    smReverbMix.setCurrentAndTargetValue (pReverbMix->load()* 0.01f);
    smOutput   .setCurrentAndTargetValue (juce::Decibels::decibelsToGain (pOutput->load()));
    smPhaserRate .setCurrentAndTargetValue (pPhaserRate->load());
    smPhaserDepth.setCurrentAndTargetValue (pPhaserDepth->load() * 0.01f);
    smPhaserMix  .setCurrentAndTargetValue (pPhaserMix->load()   * 0.01f);
    smChorusRate .setCurrentAndTargetValue (pChorusRate->load());
    smChorusDepth.setCurrentAndTargetValue (pChorusDepth->load() * 0.01f);
    smChorusMix  .setCurrentAndTargetValue (pChorusMix->load()   * 0.01f);
    smTremoloRate .setCurrentAndTargetValue (pTremoloRate->load());
    smTremoloDepth.setCurrentAndTargetValue (pTremoloDepth->load() * 0.01f);

    setLatencySamples ((int) oversampler.getLatencyInSamples());
}

//==============================================================================
void TheBowottoAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                             juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples  = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (numSamples == 0)
        return;

    if (bypassParam != nullptr && bypassParam->get())
        return;

    // Host tempo, for PHASER/CHORUS rate and ECHO time sync. Standalone (or
    // any host that doesn't report a valid position) falls back to 120 BPM
    // rather than disabling sync outright.
    double hostBpm = 120.0;
    if (auto* playHead = getPlayHead())
        if (auto position = playHead->getPosition())
            if (auto bpm = position->getBpm())
                hostBpm = *bpm;

    // --- smoothed targets, once per block ---------------------------------
    smMorph  .setTargetValue (pMorph->load()   * 0.01f);
    smSustain.setTargetValue (pSustain->load() * 0.01f);
    smTone   .setTargetValue (pTone->load()    * 0.01f);
    smScoop  .setTargetValue (pScoop->load()   * 0.01f);
    smDrive  .setTargetValue (1.0f + pGain->load() * 0.09f);   // 1..10
    smSwell  .setTargetValue (pSwell->load());
    smVibrato.setTargetValue (pVibrato->load() * 0.01f);
    smRosin  .setTargetValue (pRosin->load()   * 0.01f);
    smSection.setTargetValue (pSection->load() * 0.01f);
    smForce  .setTargetValue (pForce->load()   * 0.01f);

    const float echoTimeMs = pEchoSync->load() > 0.5f
        ? juce::jlimit (80.0f, 900.0f, divisionToMs ((int) pEchoDivision->load(), hostBpm))
        : pEchoTime->load();
    smEchoTime.setTargetValue (echoTimeMs);
    smEchoFb .setTargetValue (pEchoFb->load() * 0.01f);
    smEchoMix.setTargetValue (pEchoMix->load() * 0.01f);
    smReverbMix.setTargetValue (pReverbMix->load() * 0.01f);
    smOutput .setTargetValue (juce::Decibels::decibelsToGain (pOutput->load()));

    const float phaserRateHz = pPhaserSync->load() > 0.5f
        ? divisionToHz ((int) pPhaserDivision->load(), hostBpm)
        : pPhaserRate->load();
    smPhaserRate .setTargetValue (phaserRateHz);
    smPhaserDepth.setTargetValue (pPhaserDepth->load() * 0.01f);
    smPhaserMix  .setTargetValue (pPhaserMix->load()   * 0.01f);

    const float chorusRateHz = pChorusSync->load() > 0.5f
        ? divisionToHz ((int) pChorusDivision->load(), hostBpm)
        : pChorusRate->load();
    smChorusRate .setTargetValue (chorusRateHz);
    smChorusDepth.setTargetValue (pChorusDepth->load() * 0.01f);
    smChorusMix  .setTargetValue (pChorusMix->load()   * 0.01f);
    smTremoloRate .setTargetValue (pTremoloRate->load());
    smTremoloDepth.setTargetValue (pTremoloDepth->load() * 0.01f);

    violin.setInstrument ((bowotto::Instrument) (int) pBody->load());

    const bool  muffOn  = pMuffOn->load() > 0.5f;
    const bool  echoOn  = pEchoOn->load() > 0.5f;
    const bool  revOn   = pReverbOn->load() > 0.5f;
    const bool  phaserOn  = pPhaserOn->load() > 0.5f;
    const bool  chorusOn = pChorusOn->load() > 0.5f;
    const bool  tremoloOn = pTremoloOn->load() > 0.5f;
    const float gateDb  = pGate->load();

    // --- 1. sum to mono, gate ---------------------------------------------
    monoBuffer.setSize (1, numSamples, false, false, true);
    auto* mono = monoBuffer.getWritePointer (0);

    const float inScale = numChannels > 1 ? 0.5f : 1.0f;
    for (int i = 0; i < numSamples; ++i)
    {
        float x = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
            x += buffer.getReadPointer (ch)[i];
        mono[i] = gate.process (x * inScale, gateDb);
    }

    uiGateDb.store (gate.lastGainDb, std::memory_order_relaxed);
    uiMorph.store (smMorph.getCurrentValue(), std::memory_order_relaxed);

    // --- tuner: detect fundamental frequency of gated signal ----------------
    const float detectedHz = detectFundamental (mono, numSamples, currentSampleRate);
    if (detectedHz > 0.0f)
    {
        const float midi = freqToMidi (detectedHz);
        const int   note = (int) std::round (midi);
        const float cents = (midi - (float) note) * 100.0f;
        uiTunerHz.store (detectedHz, std::memory_order_relaxed);
        uiTunerCents.store (cents, std::memory_order_relaxed);
        uiTunerNote.store (note, std::memory_order_relaxed);
    }
    else
    {
        uiTunerHz.store (0.0f, std::memory_order_relaxed);
        uiTunerCents.store (0.0f, std::memory_order_relaxed);
        uiTunerNote.store (-1, std::memory_order_relaxed);
    }

    // --- 2. violin path taps here (pre-fuzz) ------------------------------
    violinL.setSize (1, numSamples, false, false, true);
    violinR.setSize (1, numSamples, false, false, true);
    auto* vL = violinL.getWritePointer (0);
    auto* vR = violinR.getWritePointer (0);

    // Skip the whole engine when MORPH is parked at zero — but only if the
    // smoother has finished, so the crossfade never cuts a moving tail.
    const bool violinActive = smMorph.getCurrentValue() > 0.0005f
                              || smMorph.getTargetValue() > 0.0005f;

    if (violinActive)
    {
        for (int i = 0; i < numSamples; ++i)
            violin.process (mono[i],
                            smSwell.getNextValue(),
                            smVibrato.getNextValue(),
                            smRosin.getNextValue(),
                            smSection.getNextValue(),
                            smForce.getNextValue(),
                            vL[i], vR[i]);
    }
    else
    {
        juce::FloatVectorOperations::clear (vL, numSamples);
        juce::FloatVectorOperations::clear (vR, numSamples);
        smSwell.skip (numSamples);
        smVibrato.skip (numSamples);
        smRosin.skip (numSamples);
        smSection.skip (numSamples);
        smForce.skip (numSamples);
    }

    // --- 3. guitar path: fuzz + amp at 4x, then cab ------------------------
    guitarBuffer.setSize (1, numSamples, false, false, true);
    guitarBuffer.copyFrom (0, 0, monoBuffer, 0, 0, numSamples);

    {
        juce::dsp::AudioBlock<float> block (guitarBuffer);
        auto osBlock = oversampler.processSamplesUp (block);
        auto* d = osBlock.getChannelPointer (0);
        const int osSamples = (int) osBlock.getNumSamples();

        // Capture start/end of block, then LINEARLY INTERPOLATE across the
        // oversampled run rather than holding one value for the whole block.
        // T22 caught the reason: holding sustain/tone/scoop/gain constant per
        // block is a stairstep, and this chain is a nonlinear recursive
        // clipper (tanh with feedback-cap state) — a big step between blocks
        // produces a real sample-domain discontinuity, not just a coarser
        // ramp. Interpolating turns that into a smooth in-block ramp instead.
        const float sus0  = smSustain.getCurrentValue(), tone0 = smTone.getCurrentValue();
        const float scp0  = smScoop.getCurrentValue(),   drv0  = smDrive.getCurrentValue();
        smSustain.skip (numSamples);
        smTone.skip (numSamples);
        smScoop.skip (numSamples);
        smDrive.skip (numSamples);
        const float sus1  = smSustain.getCurrentValue(), tone1 = smTone.getCurrentValue();
        const float scp1  = smScoop.getCurrentValue(),   drv1  = smDrive.getCurrentValue();

        const float invOs = osSamples > 1 ? 1.0f / (float) (osSamples - 1) : 0.0f;

        for (int i = 0; i < osSamples; ++i)
        {
            const float t   = (float) i * invOs;
            const float sus = sus0  + (sus1  - sus0)  * t;
            const float tone= tone0 + (tone1 - tone0) * t;
            const float scp = scp0  + (scp1  - scp0)  * t;
            const float drv = drv0  + (drv1  - drv0)  * t;

            float s = d[i];
            if (muffOn)
                s = muff.process (s, sus, tone, scp);
            s = amp.process (s, drv);
            d[i] = s;
        }

        oversampler.processSamplesDown (block);
    }

    {
        juce::dsp::AudioBlock<float> block (guitarBuffer);
        juce::dsp::ProcessContextReplacing<float> ctx (block);
        cab.process (ctx);
    }

    // --- 4. morph crossfade (equal power), echo, reverb, output ------------
    auto* outL = buffer.getWritePointer (0);
    auto* outR = numChannels > 1 ? buffer.getWritePointer (1) : outL;

    const auto* gtr = guitarBuffer.getReadPointer (0);

    // Morph mix only — the pedalboard (phaser/chorus/echo/reverb) runs on
    // the combined signal afterward, matching the spec's chain order:
    // MORPH -> PHASER -> CHORUS -> TAPE ECHO -> REVERB -> OUT.
    for (int i = 0; i < numSamples; ++i)
    {
        const float m  = smMorph.getNextValue();
        const float gG = std::cos (m * juce::MathConstants<float>::halfPi);
        const float gV = std::sin (m * juce::MathConstants<float>::halfPi);

        const float l = gtr[i] * gG + vL[i] * gV;
        const float r = gtr[i] * gG + vR[i] * gV;

        // In a mono layout outR ALIASES outL (same pointer, set above). The
        // first fix here still wrote outL then unconditionally outR=r right
        // after it, which clobbered the correct mono sum with the right
        // channel alone on the very next line — same bug, one line later.
        // Guard the second write so mono gets only the summed image.
        outL[i] = numChannels > 1 ? l : 0.5f * (l + r);
        if (numChannels > 1)
            outR[i] = r;
    }

    // PHASER and CHORUS are whole-block JUCE dsp effects (wrap the built-in
    // modules rather than hand-rolling modulated delay/allpass networks).
    // `buffer` already has the right channel count for the host (1 or 2).
    if (phaserOn)
    {
        phaser.setRate (smPhaserRate.getNextValue());
        phaser.setDepth (smPhaserDepth.getNextValue());
        phaser.setMix (smPhaserMix.getNextValue());
        juce::dsp::AudioBlock<float> block (buffer);
        juce::dsp::ProcessContextReplacing<float> ctx (block);
        phaser.process (ctx);
    }
    else
    {
        smPhaserRate.skip (numSamples);
        smPhaserDepth.skip (numSamples);
        smPhaserMix.skip (numSamples);
    }

    if (chorusOn)
    {
        chorus.setRate (smChorusRate.getNextValue());
        chorus.setDepth (smChorusDepth.getNextValue());
        chorus.setMix (smChorusMix.getNextValue());
        juce::dsp::AudioBlock<float> block (buffer);
        juce::dsp::ProcessContextReplacing<float> ctx (block);
        chorus.process (ctx);
    }
    else
    {
        smChorusRate.skip (numSamples);
        smChorusDepth.skip (numSamples);
        smChorusMix.skip (numSamples);
    }

    for (int i = 0; i < numSamples; ++i)
    {
        const float et  = smEchoTime.getNextValue();
        const float efb = smEchoFb.getNextValue();
        const float emx = smEchoMix.getNextValue();

        if (echoOn)
        {
            outL[i] += echoL.process (outL[i], et, efb) * emx;
            if (outR != outL)
                outR[i] += echoR.process (outR[i], et * 1.03f, efb) * emx;   // slight L/R offset
        }

        if (tremoloOn)
        {
            const float g = tremolo.nextGain (smTremoloRate.getNextValue(),
                                              smTremoloDepth.getNextValue());
            outL[i] *= g;
            if (outR != outL)
                outR[i] *= g;
        }
        else
        {
            smTremoloRate.skip (1);
            smTremoloDepth.skip (1);
        }
    }

    if (revOn)
    {
        // juce::Reverb::setParameters() silently applies dryScaleFactor=2.0
        // and wetScaleFactor=3.0 internally (see juce_Reverb.h) — authoring
        // dryLevel=1.0 here actually asks JUCE for 2.0x (+6 dB) dry gain,
        // audible even at MIX=0. Divide out both factors so what we author
        // is what comes out: dryLevel=0.5 -> true unity dry; wetLevel is the
        // intended 0..0.8 range instead of an effective 0..2.4.
        juce::Reverb::Parameters rp;
        rp.roomSize = pReverbSize->load() * 0.01f;
        rp.damping  = 0.45f;
        rp.width    = 0.9f;
        rp.wetLevel = (smReverbMix.getTargetValue() * 0.8f) / 3.0f;
        rp.dryLevel = 1.0f / 2.0f;
        reverb.setParameters (rp);

        if (numChannels > 1)
            reverb.processStereo (outL, outR, numSamples);
        else
            reverb.processMono (outL, numSamples);
    }
    smReverbMix.skip (numSamples);


    for (int i = 0; i < numSamples; ++i)
    {
        const float g = smOutput.getNextValue() * kWetTrim;
        outL[i] = bowotto::softLimit (outL[i] * g);
        if (outR != outL)
            outR[i] = bowotto::softLimit (outR[i] * g);
    }


    for (int ch = 2; ch < numChannels; ++ch)
        buffer.clear (ch, 0, numSamples);
}

//==============================================================================
void TheBowottoAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void TheBowottoAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

//==============================================================================
juce::AudioProcessorEditor* TheBowottoAudioProcessor::createEditor()
{
    return new TheBowottoAudioProcessorEditor (*this);
}

//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new TheBowottoAudioProcessor();
}
