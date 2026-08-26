#pragma once

#include "PluginProcessor.h"

//==============================================================================
/** THE BOWOTTO look — the family chassis language (The Toa / The Vulture):
    dark charcoal brushed steel, layered glow-arc knobs, glass display,
    engraved motifs, corner screws. Bowotto's own identity inside it: EMBER
    AMBER for the fuzz half, MELLON VIOLET for the strings half, and the
    MORPH knob's glow crossfading between them as it turns. Thin gold line
    stars etched into the metal. */
namespace BowottoColours
{
    const juce::Colour amber         { 0xffffa02a };   // the Muff side
    const juce::Colour amberGlow     { 0xffffb84d };
    const juce::Colour violet        { 0xffb069ff };   // the Bow side
    const juce::Colour violetGlow    { 0xffc48aff };
    const juce::Colour chassisTop    { 0xff26262b };
    const juce::Colour chassisBottom { 0xff0e0e11 };
    const juce::Colour vignetteCore  { 0xff2a1030 };   // violet-oxblood ambient
    const juce::Colour glassTop      { 0xff1a1d26 };
    const juce::Colour glassBottom   { 0xff0b0c10 };
    const juce::Colour text          { 0xffe6e6ea };
    const juce::Colour dimText       { 0xff8e8e97 };
    const juce::Colour gold          { 0xffc9a35c };   // star engraving
}

class BowottoLookAndFeel : public juce::LookAndFeel_V4
{
public:
    BowottoLookAndFeel();

    void drawRotarySlider (juce::Graphics&, int x, int y, int w, int h,
                           float sliderPos, float startAngle, float endAngle,
                           juce::Slider&) override;
    void drawToggleButton (juce::Graphics&, juce::ToggleButton&,
                           bool highlighted, bool down) override;
    void drawComboBox (juce::Graphics&, int width, int height, bool isDown,
                       int buttonX, int buttonY, int buttonW, int buttonH,
                       juce::ComboBox&) override;
};

//==============================================================================
class TheBowottoAudioProcessorEditor : public juce::AudioProcessorEditor,
                                       private juce::Timer
{
public:
    explicit TheBowottoAudioProcessorEditor (TheBowottoAudioProcessor&);
    ~TheBowottoAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;

    void addKnob (juce::Slider&, const juce::String& paramId,
                  const juce::String& label, juce::Colour accent);
    void drawMorphEmblem (juce::Graphics&, juce::Rectangle<float> area, float morph);
    void drawScrew (juce::Graphics&, juce::Point<float> centre, float angleDegrees);
    static juce::Image renderBrushedTexture (int width, int height);

    TheBowottoAudioProcessor& proc;
    BowottoLookAndFeel lookAndFeel;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    using ComboAttachment  = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

    juce::ToggleButton muffOn { "MUFF" };
    juce::Slider sustain, tone, scoop, gain;

    juce::Slider morph, gateKnob;

    juce::Slider swell, vibrato, rosin, section, force;
    juce::ComboBox body;

    juce::ToggleButton echoOn { "ECHO" }, reverbOn { "VERB" };
    juce::Slider echoTime, echoFb, echoMix, reverbSize, reverbMix, output;

    std::vector<std::unique_ptr<SliderAttachment>> sliderAttachments;
    std::vector<std::unique_ptr<ButtonAttachment>> buttonAttachments;
    std::unique_ptr<ComboAttachment> bodyAttachment;

    std::vector<std::pair<juce::Component*, juce::String>> knobLabels;

    juce::Image brushed;
    float shownMorph = 0.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TheBowottoAudioProcessorEditor)
};
