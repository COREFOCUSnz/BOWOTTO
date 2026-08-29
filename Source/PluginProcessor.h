#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "DSP/BowottoDSP.h"
#include "DSP/ViolinEngine.h"

//==============================================================================
/**
    THE BOWOTTO — Big Muff grunge machine that morphs into a violin.

        IN -> GATE -> MUFF (4x OS) -> VINTAGE STACK (4x OS) --+
                 |                                            +-> CAB ----+
                 |                                                        |
                 +--> VIOLIN ENGINE (swell/sustain/vibrato/rosin/body/section)
                                                                          |
              MORPH crossfades cab <-> violin (equal power) <-------------+
                 -> TAPE ECHO -> REVERB -> OUTPUT -> peak guard

    The violin path taps the signal AFTER the gate but BEFORE the fuzz: the
    bow excites the string, not the pedalboard. MORPH replaces the cab with
    the violin body rather than stacking them — both are the instrument's
    radiating box, and running both gives you neither.

    Processing is mono internally (summed input); the SECTION desks, echo and
    reverb open it back out to stereo.
*/
class TheBowottoAudioProcessor final : public juce::AudioProcessor
{
public:
    TheBowottoAudioProcessor();
    ~TheBowottoAudioProcessor() override = default;

    //==========================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==========================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override                            { return true; }

    const juce::String getName() const override                { return JucePlugin_Name; }
    bool acceptsMidi() const override                          { return false; }
    bool producesMidi() const override                         { return false; }
    bool isMidiEffect() const override                         { return false; }
    // Echo repeats (900 ms, 70 % fb) plus the reverb tail.
    double getTailLengthSeconds() const override               { return 5.0; }

    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParam; }

    int getNumPrograms() override                              { return 1; }
    int getCurrentProgram() override                           { return 0; }
    void setCurrentProgram (int) override                      {}
    const juce::String getProgramName (int) override           { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    //==========================================================================
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

    juce::AudioProcessorValueTreeState apvts;

    /** Gate LED + morph position + tuner display for the editor. */
    std::atomic<float> uiGateDb    { 0.0f };
    std::atomic<float> uiMorph     { 0.0f };
    std::atomic<float> uiTunerHz   { 0.0f };  // detected fundamental frequency
    std::atomic<float> uiTunerCents{ 0.0f };  // cents offset from equal temperament
    std::atomic<int>   uiTunerNote { -1 };    // MIDI note number, -1 = no confident pitch

    // Fixed gain architecture — same discipline as The Toa:
    //   kWetTrim keeps the wet path from clipping the host,
    //   the peak guard's ceiling (-0.26 dBFS) is a tested contract.
    static constexpr float kWetTrim      = 0.30f;    // -10.5 dB
    static constexpr int   kControlBlock = 32;

private:
    //==========================================================================
    juce::AudioParameterBool* bypassParam = nullptr;

    // Cached raw-value pointers — no string lookups on the audio thread.
    std::atomic<float>* pGate       = nullptr;
    std::atomic<float>* pMuffOn     = nullptr;
    std::atomic<float>* pSustain    = nullptr;
    std::atomic<float>* pTone       = nullptr;
    std::atomic<float>* pScoop      = nullptr;
    std::atomic<float>* pGain       = nullptr;
    std::atomic<float>* pMorph      = nullptr;
    std::atomic<float>* pSwell      = nullptr;
    std::atomic<float>* pVibrato    = nullptr;
    std::atomic<float>* pRosin      = nullptr;
    std::atomic<float>* pSection    = nullptr;
    std::atomic<float>* pForce      = nullptr;
    std::atomic<float>* pBody       = nullptr;
    std::atomic<float>* pPhaserOn   = nullptr;
    std::atomic<float>* pPhaserRate = nullptr;
    std::atomic<float>* pPhaserDepth= nullptr;
    std::atomic<float>* pPhaserMix  = nullptr;
    std::atomic<float>* pPhaserSync = nullptr;
    std::atomic<float>* pPhaserDivision = nullptr;
    std::atomic<float>* pChorusOn   = nullptr;
    std::atomic<float>* pChorusRate = nullptr;
    std::atomic<float>* pChorusDepth= nullptr;
    std::atomic<float>* pChorusMix  = nullptr;
    std::atomic<float>* pChorusSync = nullptr;
    std::atomic<float>* pChorusDivision = nullptr;
    std::atomic<float>* pEchoOn     = nullptr;
    std::atomic<float>* pEchoTime   = nullptr;
    std::atomic<float>* pEchoFb     = nullptr;
    std::atomic<float>* pEchoMix    = nullptr;
    std::atomic<float>* pEchoSync   = nullptr;
    std::atomic<float>* pEchoDivision = nullptr;
    std::atomic<float>* pTremoloOn   = nullptr;
    std::atomic<float>* pTremoloRate = nullptr;
    std::atomic<float>* pTremoloDepth= nullptr;
    std::atomic<float>* pReverbOn   = nullptr;
    std::atomic<float>* pReverbSize = nullptr;
    std::atomic<float>* pReverbMix  = nullptr;
    std::atomic<float>* pOutput     = nullptr;

    //==========================================================================
    bowotto::NoiseGate    gate;
    bowotto::BigMuff      muff;
    bowotto::VintageAmp   amp;
    bowotto::ViolinEngine violin;
    bowotto::TapeEcho     echoL, echoR;
    bowotto::Tremolo      tremolo;

    juce::dsp::Convolution     cab;
    juce::Reverb               reverb;

    // Family precedent: The Toa wraps juce::dsp::Chorus directly rather than
    // hand-rolling a modulated delay. FLANGER reuses the same module with a
    // much shorter centre delay and real feedback — a flanger IS a chorus
    // with a tight delay and a resonant comb, not a different mechanism.
    juce::dsp::Phaser<float> phaser;
    juce::dsp::Chorus<float> chorus;
    juce::dsp::Oversampling<float> oversampler { 1, 2,
        juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR };

    // Param smoothing (zipper safety). Control-block rate, like the family.
    juce::SmoothedValue<float> smMorph, smSustain, smTone, smScoop, smDrive,
                               smSwell, smVibrato, smRosin, smSection, smForce,
                               smPhaserRate, smPhaserDepth, smPhaserMix,
                               smChorusRate, smChorusDepth, smChorusMix,
                               smEchoTime, smEchoFb, smEchoMix,
                               smTremoloRate, smTremoloDepth,
                               smReverbMix, smOutput;

    juce::AudioBuffer<float> monoBuffer, guitarBuffer, violinL, violinR;

    double currentSampleRate = 44100.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TheBowottoAudioProcessor)
};
