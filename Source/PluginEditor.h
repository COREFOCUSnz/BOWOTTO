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

    // Per-pedal identity, PEDALS takeover panel: each stompbox gets its own
    // colour rather than sharing amber/violet with the amp/violin halves.
    const juce::Colour phaserYellow  { 0xfff2d43d };
    const juce::Colour chorusBlue    { 0xff3aa0ff };
    const juce::Colour echoGreen     { 0xff3ddc6a };
    const juce::Colour reverbRed     { 0xffff4d4d };
}

class BowottoLookAndFeel : public juce::LookAndFeel_V4
{
public:
    BowottoLookAndFeel();

    // A per-component colour override for toggle buttons whose accent isn't
    // the default amber/violet split — the four pedal stompboxes each set
    // this to their own identity colour. Falls back to the old
    // componentID == "violet" scheme, then amber, when unset.
    static constexpr int kAccentColourId = 0x1b4a3901;

    void drawRotarySlider (juce::Graphics&, int x, int y, int w, int h,
                           float sliderPos, float startAngle, float endAngle,
                           juce::Slider&) override;
    void drawToggleButton (juce::Graphics&, juce::ToggleButton&,
                           bool highlighted, bool down) override;
    void drawComboBox (juce::Graphics&, int width, int height, bool isDown,
                       int buttonX, int buttonY, int buttonW, int buttonH,
                       juce::ComboBox&) override;

    // Smaller than the LookAndFeel_V4 default so the narrow SYNC division
    // boxes ("1/16T", "1/16D" are the longest entries) fit without eliding.
    juce::Font getComboBoxFont (juce::ComboBox&) override;
};

//==============================================================================
/**
    The pedal takeover panel: fills the ENTIRE main knob region (same
    footprint as MUFF+MORPH+BOW) rather than piling on top of it. Opened
    from the PEDALS tab up top that lives on the editor itself. Same
    takeover principle as THE TOA's PedalPanel.

    Laid out 2x2 — PHASER / CHORUS on top, ECHO / REVERB below — so each
    pedal gets a full half-width, half-height cell and its three knobs
    (RATE/DEPTH/MIX or TIME/FEED/MIX) have real room instead of piling four
    columns edge to edge.
*/
class TabDisplay final : public juce::Component,
                         private juce::Timer
{
public:
    explicit TabDisplay (TheBowottoAudioProcessor&);
    ~TabDisplay() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void updateSyncVisibility();

    static constexpr int kNumPedals = 4;

    TheBowottoAudioProcessor& processorRef;

    // PEDALS: toggle + up to three knobs per pedal, all live children.
    juce::ToggleButton phaserOn { "PHASER" }, chorusOn { "CHORUS" },
                       echoOn { "ECHO" }, reverbOn { "REVERB" };
    juce::Slider phaserRate, phaserDepth, phaserMix;
    juce::Slider chorusRate, chorusDepth, chorusMix;
    juce::Slider echoTime, echoFb, echoMix;
    juce::Slider reverbSize, reverbMix;

    // Tempo sync: PHASER RATE / CHORUS RATE / ECHO TIME can each lock to a
    // host-tempo note division instead of running free (Hz or ms). SYNC
    // toggles which one is visible; the DSP side reads both parameters
    // every block and picks whichever mode is active (PluginProcessor.cpp).
    juce::ToggleButton phaserSyncBtn { "SYNC" }, chorusSyncBtn { "SYNC" }, echoSyncBtn { "SYNC" };
    juce::ComboBox phaserDivisionBox, chorusDivisionBox, echoDivisionBox;

    std::array<juce::Rectangle<float>, kNumPedals> pedalBounds;
    std::vector<std::pair<juce::Component*, juce::String>> knobLabels;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    using ComboAttachment  = juce::AudioProcessorValueTreeState::ComboBoxAttachment;
    std::vector<std::unique_ptr<SliderAttachment>> sliderAttachments;
    std::vector<std::unique_ptr<ButtonAttachment>> buttonAttachments;
    std::vector<std::unique_ptr<ComboAttachment>> comboAttachments;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TabDisplay)
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
    void mouseDown (const juce::MouseEvent&) override;

    /** Used by the Snapshot tool (and the tab clicks) to switch views.
        0 = MAIN, 1 = PEDALS. */
    void setCurrentView (int viewIndex);

private:
    void timerCallback() override;

    void addKnob (juce::Slider&, const juce::String& paramId,
                  const juce::String& label, juce::Colour accent);
    void drawMorphEmblem (juce::Graphics&, juce::Rectangle<float> area, float morph);
    void drawScrew (juce::Graphics&, juce::Point<float> centre, float angleDegrees);
    void paintTunerRibbon (juce::Graphics&, juce::Rectangle<float> area);
    void updateViewVisibility();
    static juce::Image renderBrushedTexture (int width, int height);

    TheBowottoAudioProcessor& proc;
    BowottoLookAndFeel lookAndFeel;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    using ComboAttachment  = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

    // The two top tabs: MAIN (amp+violin knobs, plus the tuner ribbon at the
    // bottom) / PEDALS (the takeover panel). Only one is ever visible.
    static constexpr int kNumViews = 2;
    int currentView { 0 };
    std::array<juce::Rectangle<float>, kNumViews> viewTabBounds;

    juce::ToggleButton muffOn { "MUFF" };
    juce::Slider sustain, tone, scoop, gain;

    juce::Slider morph, gateKnob;

    juce::Slider swell, vibrato, rosin, section, force;
    juce::ComboBox body;

    juce::Slider output;

    std::vector<std::unique_ptr<SliderAttachment>> sliderAttachments;
    std::vector<std::unique_ptr<ButtonAttachment>> buttonAttachments;
    std::unique_ptr<ComboAttachment> bodyAttachment;

    std::vector<std::pair<juce::Component*, juce::String>> knobLabels;

    TabDisplay tabDisplay { proc };

    // TUNER ribbon (MAIN view, bottom strip) — wide and thin, polled
    // straight from the processor's lock-free atomics.
    juce::Rectangle<float> tunerRibbonBounds;
    int   tunerMidiNote { -1 };
    float tunerCents { 0.0f };
    float tunerHz { 0.0f };

    juce::Image brushed;
    float shownMorph = 0.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TheBowottoAudioProcessorEditor)
};
