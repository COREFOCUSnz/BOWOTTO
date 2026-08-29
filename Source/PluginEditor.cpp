#include "PluginEditor.h"

using namespace BowottoColours;

//==============================================================================
BowottoLookAndFeel::BowottoLookAndFeel()
{
    setColour (juce::Slider::textBoxTextColourId,       text.withAlpha (0.85f));
    setColour (juce::Slider::textBoxOutlineColourId,    juce::Colours::transparentBlack);
    setColour (juce::Label::textColourId,               text);
    setColour (juce::ComboBox::textColourId,            text);
    setColour (juce::ComboBox::backgroundColourId,      juce::Colour (0xff141519));
    setColour (juce::ComboBox::outlineColourId,         violet.withAlpha (0.4f));
    setColour (juce::ComboBox::arrowColourId,           violet);
    setColour (juce::PopupMenu::backgroundColourId,     juce::Colour (0xff0c0d12));
    setColour (juce::PopupMenu::textColourId,           text);
    setColour (juce::PopupMenu::highlightedBackgroundColourId, violet.withAlpha (0.35f));
    setColour (juce::PopupMenu::highlightedTextColourId, juce::Colours::white);
}

//==============================================================================
// The family knob: layered glow arcs over a knurled steel dish, glowing
// arrow pointer. Straight from The Toa's drawRotarySlider, accent per knob.
void BowottoLookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int w, int h,
                                           float pos, float startAngle, float endAngle,
                                           juce::Slider& slider)
{
    const auto accent = slider.findColour (juce::Slider::rotarySliderFillColourId);

    const auto  bounds = juce::Rectangle<int> (x, y, w, h).toFloat();
    const auto  centre = bounds.getCentre();
    const float knobR  = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f - 12.0f;
    const float arcR   = knobR + 6.0f;
    const float angle  = startAngle + pos * (endAngle - startAngle);

    if (knobR <= 4.0f)
        return;

    juce::Path back;
    back.addCentredArc (centre.x, centre.y, arcR, arcR, 0.0f, startAngle, endAngle, true);
    g.setColour (juce::Colour (0xff0c0c0e));
    g.strokePath (back, juce::PathStrokeType (5.0f, juce::PathStrokeType::curved,
                                              juce::PathStrokeType::rounded));
    g.setColour (accent.withAlpha (0.14f));
    g.strokePath (back, juce::PathStrokeType (7.0f, juce::PathStrokeType::curved,
                                              juce::PathStrokeType::rounded));

    if (std::abs (angle - startAngle) > 0.012f)
    {
        juce::Path value;
        value.addCentredArc (centre.x, centre.y, arcR, arcR, 0.0f, startAngle, angle, true);

        g.setColour (accent.withAlpha (0.18f));
        g.strokePath (value, juce::PathStrokeType (12.0f, juce::PathStrokeType::curved,
                                                   juce::PathStrokeType::rounded));
        g.setColour (accent.withAlpha (0.45f));
        g.strokePath (value, juce::PathStrokeType (7.0f, juce::PathStrokeType::curved,
                                                   juce::PathStrokeType::rounded));
        g.setColour (accent);
        g.strokePath (value, juce::PathStrokeType (3.2f, juce::PathStrokeType::curved,
                                                   juce::PathStrokeType::rounded));
        g.setColour (juce::Colours::white.withAlpha (0.55f));
        g.strokePath (value, juce::PathStrokeType (1.1f, juce::PathStrokeType::curved,
                                                   juce::PathStrokeType::rounded));
    }

    const auto dish = juce::Rectangle<float> (knobR * 2.0f, knobR * 2.0f).withCentre (centre);
    g.setColour (juce::Colours::black.withAlpha (0.6f));
    g.fillEllipse (dish.translated (0.0f, 2.5f).expanded (1.2f));

    g.setGradientFill (juce::ColourGradient (juce::Colour (0xff54575e), centre.x, centre.y - knobR,
                                             juce::Colour (0xff232429), centre.x, centre.y + knobR, false));
    g.fillEllipse (dish);
    g.setColour (juce::Colour (0xff0a0a0c));
    g.drawEllipse (dish, 1.2f);

    // Knurled rim.
    for (float deg = 0.0f; deg < 360.0f; deg += 4.5f)
    {
        const float a  = juce::degreesToRadians (deg);
        const float s  = std::sin (a), c = std::cos (a);
        const float sh = 0.10f + 0.16f * std::abs (std::sin (a - 0.7f));

        g.setColour (juce::Colours::white.withAlpha (sh));
        g.drawLine (centre.x + s * (knobR - 7.0f), centre.y - c * (knobR - 7.0f),
                    centre.x + s * (knobR - 0.5f), centre.y - c * (knobR - 0.5f), 1.0f);
    }

    const float faceR = knobR - 7.5f;
    const auto  face  = juce::Rectangle<float> (faceR * 2.0f, faceR * 2.0f).withCentre (centre);

    juce::ColourGradient fg (juce::Colour (0xff63666e),
                             centre.x - faceR * 0.28f, centre.y - faceR * 0.42f,
                             juce::Colour (0xff1a1b1f), centre.x, centre.y + faceR, true);
    fg.addColour (0.45, juce::Colour (0xff3c3e45));
    g.setGradientFill (fg);
    g.fillEllipse (face);
    g.setColour (juce::Colour (0xff0e0f12));
    g.drawEllipse (face, 1.0f);

    juce::Path arrow;
    arrow.startNewSubPath ( 0.0f, -knobR + 6.0f);
    arrow.lineTo          ( 5.5f, -knobR + 17.5f);
    arrow.lineTo          ( 0.0f, -knobR + 14.5f);
    arrow.lineTo          (-5.5f, -knobR + 17.5f);
    arrow.closeSubPath();
    arrow.applyTransform (juce::AffineTransform::rotation (angle).translated (centre));

    g.setColour (accent.withAlpha (0.40f));
    g.strokePath (arrow, juce::PathStrokeType (4.0f, juce::PathStrokeType::curved,
                                               juce::PathStrokeType::rounded));
    g.setColour (accent);
    g.fillPath (arrow);
    g.setColour (juce::Colours::white.withAlpha (0.75f));
    g.strokePath (arrow, juce::PathStrokeType (0.7f, juce::PathStrokeType::curved,
                                               juce::PathStrokeType::rounded));
}

//==============================================================================
// Vulture-school stomp toggle: recessed steel pill, accent LED, engraved label.
void BowottoLookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& b,
                                           bool highlighted, bool)
{
    auto r = b.getLocalBounds().toFloat().reduced (1.5f);
    const bool on = b.getToggleState();
    const auto accent = b.isColourSpecified (kAccentColourId) ? b.findColour (kAccentColourId)
                       : b.getComponentID() == "violet"        ? violet
                                                                : amber;

    g.setColour (juce::Colours::black.withAlpha (0.55f));
    g.fillRoundedRectangle (r.translated (0.0f, 1.5f), 5.0f);

    g.setGradientFill (juce::ColourGradient (juce::Colour (0xff34363c), r.getX(), r.getY(),
                                             juce::Colour (0xff17181c), r.getX(), r.getBottom(), false));
    g.fillRoundedRectangle (r, 5.0f);
    g.setColour (on ? accent.withAlpha (0.8f) : juce::Colour (0xff0a0a0c));
    g.drawRoundedRectangle (r, 5.0f, 1.2f);

    if (on)
    {
        g.setColour (accent.withAlpha (0.12f));
        g.fillRoundedRectangle (r, 5.0f);
    }

    // LED.
    const auto led = juce::Rectangle<float> (7.0f, 7.0f)
                         .withCentre ({ r.getX() + 12.0f, r.getCentreY() });
    if (on)
    {
        g.setColour (accent.withAlpha (0.30f));
        g.fillEllipse (led.expanded (4.0f));
        g.setColour (accent);
    }
    else
        g.setColour (juce::Colour (0xff2a2b30));
    g.fillEllipse (led);

    g.setColour (on ? text : (highlighted ? text.withAlpha (0.8f) : dimText));
    g.setFont (juce::Font (juce::FontOptions (11.5f, juce::Font::bold)));
    g.drawText (b.getButtonText(), r.withTrimmedLeft (18.0f), juce::Justification::centred);
}

void BowottoLookAndFeel::drawComboBox (juce::Graphics& g, int width, int height,
                                       bool, int, int, int, int, juce::ComboBox&)
{
    const auto r = juce::Rectangle<float> (0.0f, 0.0f, (float) width, (float) height)
                       .reduced (1.0f);
    g.setGradientFill (juce::ColourGradient (glassTop, r.getX(), r.getY(),
                                             glassBottom, r.getX(), r.getBottom(), false));
    g.fillRoundedRectangle (r, 5.0f);
    g.setColour (violet.withAlpha (0.45f));
    g.drawRoundedRectangle (r, 5.0f, 1.1f);

    juce::Path arrowPath;
    const float ax = (float) width - 14.0f, ay = (float) height * 0.5f;
    arrowPath.addTriangle (ax - 4.0f, ay - 2.5f, ax + 4.0f, ay - 2.5f, ax, ay + 3.5f);
    g.setColour (violet);
    g.fillPath (arrowPath);
}

juce::Font BowottoLookAndFeel::getComboBoxFont (juce::ComboBox&)
{
    return juce::Font (juce::FontOptions (11.0f, juce::Font::bold));
}

//==============================================================================
// TabDisplay — the PEDALS takeover panel, 2x2: PHASER/CHORUS on top,
// ECHO/REVERB below. Opened from the PEDALS tab the main editor draws up
// top; this component only ever occupies the exact footprint MAIN's knobs
// use, so it replaces them instead of piling on top.
//==============================================================================
TabDisplay::TabDisplay (TheBowottoAudioProcessor& p) : processorRef (p)
{
    auto addPedalKnob = [this] (juce::Slider& s, const juce::String& paramId,
                                const juce::String& label, juce::Colour accent)
    {
        s.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        s.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
        s.setColour (juce::Slider::rotarySliderFillColourId, accent);
        s.setPopupDisplayEnabled (true, true, this);
        addAndMakeVisible (s);
        sliderAttachments.push_back (std::make_unique<SliderAttachment> (processorRef.apvts, paramId, s));
        knobLabels.push_back ({ &s, label });
    };

    addPedalKnob (phaserRate,  "phaserrate",  "RATE",  phaserYellow);
    addPedalKnob (phaserDepth, "phaserdepth", "DEPTH", phaserYellow);
    addPedalKnob (phaserMix,   "phasermix",   "MIX",   phaserYellow);
    addPedalKnob (chorusRate,  "chorusrate",  "RATE",  chorusBlue);
    addPedalKnob (chorusDepth, "chorusdepth", "DEPTH", chorusBlue);
    addPedalKnob (chorusMix,   "chorusmix",   "MIX",   chorusBlue);
    addPedalKnob (echoTime,    "echotime",    "TIME",  echoGreen);
    addPedalKnob (echoFb,      "echofb",      "FEED",  echoGreen);
    addPedalKnob (echoMix,     "echomix",     "MIX",   echoGreen);
    addPedalKnob (reverbSize,  "reverbsize",  "SIZE",  reverbRed);
    addPedalKnob (reverbMix,   "reverbmix",   "MIX",   reverbRed);

    phaserOn.setColour (BowottoLookAndFeel::kAccentColourId, phaserYellow);
    chorusOn.setColour (BowottoLookAndFeel::kAccentColourId, chorusBlue);
    echoOn.setColour   (BowottoLookAndFeel::kAccentColourId, echoGreen);
    reverbOn.setColour (BowottoLookAndFeel::kAccentColourId, reverbRed);
    for (auto* t : { &phaserOn, &chorusOn, &echoOn, &reverbOn })
        addAndMakeVisible (*t);

    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "phaseron", phaserOn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "choruson", chorusOn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "echoon",   echoOn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "reverbon", reverbOn));

    // SYNC: a small toggle that swaps the RATE/TIME knob for a tempo-locked
    // note-division picker. REVERB has no rate concept, so it gets neither.
    phaserSyncBtn.setColour (BowottoLookAndFeel::kAccentColourId, phaserYellow);
    chorusSyncBtn.setColour (BowottoLookAndFeel::kAccentColourId, chorusBlue);
    echoSyncBtn.setColour   (BowottoLookAndFeel::kAccentColourId, echoGreen);
    for (auto* t : { &phaserSyncBtn, &chorusSyncBtn, &echoSyncBtn })
        addAndMakeVisible (*t);

    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "phasersync", phaserSyncBtn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "chorussync", chorusSyncBtn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (processorRef.apvts, "echosync",   echoSyncBtn));

    auto setupDivisionBox = [this] (juce::ComboBox& box, const juce::String& paramId)
    {
        if (auto* choiceParam = dynamic_cast<juce::AudioParameterChoice*> (processorRef.apvts.getParameter (paramId)))
            box.addItemList (choiceParam->choices, 1);
        addAndMakeVisible (box);
        comboAttachments.push_back (std::make_unique<ComboAttachment> (processorRef.apvts, paramId, box));
    };
    setupDivisionBox (phaserDivisionBox, "phaserdivision");
    setupDivisionBox (chorusDivisionBox, "chorusdivision");
    setupDivisionBox (echoDivisionBox,   "echodivision");

    updateSyncVisibility();
    startTimerHz (15);
}

TabDisplay::~TabDisplay() = default;

void TabDisplay::updateSyncVisibility()
{
    const bool phaserSynced = processorRef.apvts.getRawParameterValue ("phasersync")->load() > 0.5f;
    phaserRate.setVisible (! phaserSynced);
    phaserDivisionBox.setVisible (phaserSynced);

    const bool chorusSynced = processorRef.apvts.getRawParameterValue ("chorussync")->load() > 0.5f;
    chorusRate.setVisible (! chorusSynced);
    chorusDivisionBox.setVisible (chorusSynced);

    const bool echoSynced = processorRef.apvts.getRawParameterValue ("echosync")->load() > 0.5f;
    echoTime.setVisible (! echoSynced);
    echoDivisionBox.setVisible (echoSynced);
}

void TabDisplay::timerCallback()
{
    updateSyncVisibility();
    repaint();
}

void TabDisplay::resized()
{
    const auto content = getLocalBounds().toFloat().reduced (14.0f, 12.0f);

    // 2x2: PHASER/CHORUS on top, ECHO/REVERB below. Each cell gets a full
    // half-width, half-height footprint — reverb only has SIZE+MIX (2
    // knobs), the rest have three.
    const float colW = content.getWidth() * 0.5f;
    const float rowH = content.getHeight() * 0.5f;
    const float knobSize = 74.0f;

    juce::ToggleButton* toggles[kNumPedals] = { &phaserOn, &chorusOn, &echoOn, &reverbOn };
    juce::Slider* knobs[kNumPedals][3] = {
        { &phaserRate, &phaserDepth, &phaserMix },
        { &chorusRate, &chorusDepth, &chorusMix },
        { &echoTime,   &echoFb,      &echoMix   },
        { &reverbSize, &reverbMix,   nullptr    }
    };

    for (int pedal = 0; pedal < kNumPedals; ++pedal)
    {
        const int   col = pedal % 2;
        const int   row = pedal / 2;
        const float cx  = content.getX() + (float) col * colW;
        const float cy  = content.getY() + (float) row * rowH;

        const auto body = juce::Rectangle<float> (cx + 10.0f, cy + 8.0f, colW - 20.0f, rowH - 16.0f);
        pedalBounds[(size_t) pedal] = body;

        toggles[pedal]->setBounds ((int) (body.getCentreX() - 50.0f), (int) body.getY() + 10, 100, 30);

        const int   numKnobs   = knobs[pedal][2] != nullptr ? 3 : 2;
        const float rowY       = body.getY() + 62.0f;
        const float totalKnobW = (float) numKnobs * knobSize;
        const float startX     = body.getCentreX() - totalKnobW * 0.5f;

        for (int k = 0; k < numKnobs; ++k)
            knobs[pedal][k]->setBounds ((int) (startX + (float) k * knobSize), (int) rowY,
                                        (int) knobSize, (int) knobSize);
    }

    // SYNC toggle + DIVISION combo overlay the first knob's slot (RATE for
    // phaser/chorus, TIME for echo) — REVERB has no rate concept.
    auto layoutSync = [] (juce::ToggleButton& syncBtn, juce::ComboBox& divBox, juce::Slider& firstKnob)
    {
        const auto kb = firstKnob.getBounds();
        syncBtn.setBounds (kb.getX() + 6, kb.getY() - 16, kb.getWidth() - 12, 12);
        // Just wide enough for "1/16T"/"1/16D" (the longest labels) + arrow.
        divBox.setBounds (kb.getCentreX() - 32, kb.getY() + kb.getHeight() / 2 - 12, 64, 22);
    };

    layoutSync (phaserSyncBtn, phaserDivisionBox, phaserRate);
    layoutSync (chorusSyncBtn, chorusDivisionBox, chorusRate);
    layoutSync (echoSyncBtn,   echoDivisionBox,   echoTime);
}

void TabDisplay::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();

    // The takeover slab: a big panel replacing the amp/violin knobs — same
    // principle as THE TOA's PedalPanel.
    g.setColour (juce::Colours::black.withAlpha (0.5f));
    g.fillRoundedRectangle (bounds.translated (0.0f, 3.0f), 10.0f);

    g.setGradientFill (juce::ColourGradient (juce::Colour (0xff1c1d22), bounds.getCentreX(), bounds.getY(),
                                             juce::Colour (0xff0e0f13), bounds.getCentreX(), bounds.getBottom(), false));
    g.fillRoundedRectangle (bounds, 10.0f);

    g.setColour (gold.withAlpha (0.4f));
    g.drawRoundedRectangle (bounds.reduced (1.0f), 10.0f, 1.4f);

    // Cross divider between the four pedal quadrants.
    g.setColour (juce::Colours::white.withAlpha (0.05f));
    g.drawLine (bounds.getCentreX(), bounds.getY() + 12.0f, bounds.getCentreX(), bounds.getBottom() - 12.0f, 1.0f);
    g.drawLine (bounds.getX() + 12.0f, bounds.getCentreY(), bounds.getRight() - 12.0f, bounds.getCentreY(), 1.0f);

    const juce::ToggleButton* toggles[kNumPedals] = { &phaserOn, &chorusOn, &echoOn, &reverbOn };
    const juce::Colour pedalAccents[kNumPedals] = { phaserYellow, chorusBlue, echoGreen, reverbRed };

    for (int pedal = 0; pedal < kNumPedals; ++pedal)
    {
        const auto body   = pedalBounds[(size_t) pedal];
        const bool on     = toggles[pedal]->getToggleState();
        const auto accent = pedalAccents[pedal];

        g.setColour (juce::Colours::black.withAlpha (0.5f));
        g.fillRoundedRectangle (body.translated (0.0f, 2.0f), 8.0f);

        g.setGradientFill (juce::ColourGradient (juce::Colour (0xff26272d), body.getCentreX(), body.getY(),
                                                 juce::Colour (0xff15161a), body.getCentreX(), body.getBottom(), false));
        g.fillRoundedRectangle (body, 8.0f);

        if (on)
        {
            g.setColour (accent.withAlpha (0.20f));
            g.drawRoundedRectangle (body.expanded (2.5f), 9.0f, 3.5f);
        }

        g.setColour (accent.withAlpha (on ? 0.75f : 0.28f));
        g.drawRoundedRectangle (body.reduced (0.8f), 8.0f, on ? 1.5f : 1.0f);
    }

    // Knob labels (RATE / DEPTH / MIX / TIME / FEED / SIZE) — skip whichever
    // slot SYNC has swapped for a division combo box.
    g.setFont (juce::Font (juce::FontOptions (10.5f, juce::Font::bold)));
    for (auto& [comp, label] : knobLabels)
    {
        if (! comp->isVisible())
            continue;
        const auto b = comp->getBounds();
        g.setColour (dimText);
        g.drawText (label, b.getX() - 10, b.getBottom() - 2, b.getWidth() + 20, 14,
                    juce::Justification::centred);
    }

    // Glass sheen across the top of the well.
    g.setGradientFill (juce::ColourGradient (juce::Colours::white.withAlpha (0.05f),
                                             bounds.getX(), bounds.getY(),
                                             juce::Colours::transparentBlack,
                                             bounds.getX(), bounds.getY() + 30.0f, false));
    g.fillRoundedRectangle (bounds.withHeight (30.0f), 10.0f);
}

//==============================================================================
TheBowottoAudioProcessorEditor::TheBowottoAudioProcessorEditor (TheBowottoAudioProcessor& p)
    : AudioProcessorEditor (p), proc (p)
{
    setLookAndFeel (&lookAndFeel);

    // Amber = the Muff half, violet = the Bow half. MORPH starts amber and
    // crossfades its glow to violet in timerCallback as the knob turns.
    addKnob (sustain,  "sustain", "SUSTAIN", amber);
    addKnob (tone,     "tone",    "TONE",    amber);
    addKnob (scoop,    "scoop",   "SCOOP",   amber);
    addKnob (gain,     "gain",    "GAIN",    amber);
    addKnob (morph,    "morph",   "MORPH",   amber);
    addKnob (gateKnob, "gate",    "GATE",    amber);
    addKnob (swell,    "swell",   "SWELL",   violet);
    addKnob (force,    "force",   "BOW",     violet);
    addKnob (vibrato,  "vibrato", "VIBRATO", violet);
    addKnob (rosin,    "rosin",   "ROSIN",   violet);
    addKnob (section,  "section", "SECTION", violet);
    addKnob (output,   "output",  "OUTPUT",  amber);

    addAndMakeVisible (muffOn);
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (proc.apvts, "muffon", muffOn));

    body.addItemList ({ "VIOLIN", "VIOLA", "CELLO" }, 1);
    addAndMakeVisible (body);
    bodyAttachment = std::make_unique<ComboAttachment> (proc.apvts, "body", body);

    addChildComponent (tabDisplay);   // shown by setCurrentView()

    setSize (980, 520);
    brushed = renderBrushedTexture (980, 520);

    // Seed the morph readout from the PARAMETER, not the audio-thread tap —
    // the tap is only fresh once audio runs, and the editor can open first.
    shownMorph = proc.apvts.getRawParameterValue ("morph")->load() * 0.01f;
    morph.setColour (juce::Slider::rotarySliderFillColourId,
                     BowottoColours::amber.interpolatedWith (BowottoColours::violet, shownMorph));

    updateViewVisibility();
    startTimerHz (30);
}

TheBowottoAudioProcessorEditor::~TheBowottoAudioProcessorEditor()
{
    setLookAndFeel (nullptr);
}

void TheBowottoAudioProcessorEditor::addKnob (juce::Slider& s, const juce::String& paramId,
                                              const juce::String& label, juce::Colour accent)
{
    s.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    s.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    s.setColour (juce::Slider::rotarySliderFillColourId, accent);
    s.setPopupDisplayEnabled (true, true, this);
    addAndMakeVisible (s);
    sliderAttachments.push_back (std::make_unique<SliderAttachment> (proc.apvts, paramId, s));
    knobLabels.push_back ({ &s, label });
}

void TheBowottoAudioProcessorEditor::timerCallback()
{
    const float m = proc.uiMorph.load (std::memory_order_relaxed);
    bool needsRepaint = false;
    if (std::abs (m - shownMorph) > 0.004f)
    {
        shownMorph = m;
        // The centre knob's glow crossfades fuzz-amber into string-violet.
        morph.setColour (juce::Slider::rotarySliderFillColourId,
                         amber.interpolatedWith (violet, m));
        needsRepaint = true;
    }

    // TUNER ribbon (MAIN view only, but poll regardless — cheap atomics).
    const int   note  = proc.uiTunerNote.load (std::memory_order_relaxed);
    const float hz    = proc.uiTunerHz.load (std::memory_order_relaxed);
    const float cents = proc.uiTunerCents.load (std::memory_order_relaxed);
    if (note != tunerMidiNote || std::abs (hz - tunerHz) > 0.05f || std::abs (cents - tunerCents) > 0.05f)
    {
        tunerMidiNote = note;
        tunerHz = hz;
        tunerCents = cents;
        needsRepaint = true;
    }

    if (needsRepaint && currentView == 0)
        repaint();
}

//==============================================================================
void TheBowottoAudioProcessorEditor::setCurrentView (int viewIndex)
{
    currentView = juce::jlimit (0, kNumViews - 1, viewIndex);
    updateViewVisibility();
    repaint();
}

void TheBowottoAudioProcessorEditor::updateViewVisibility()
{
    const bool mainView = currentView == 0;

    muffOn.setVisible (mainView);
    sustain.setVisible (mainView);
    tone.setVisible (mainView);
    scoop.setVisible (mainView);
    gain.setVisible (mainView);
    morph.setVisible (mainView);
    swell.setVisible (mainView);
    vibrato.setVisible (mainView);
    rosin.setVisible (mainView);
    section.setVisible (mainView);
    force.setVisible (mainView);
    body.setVisible (mainView);

    // GATE and OUTPUT are utility controls — always visible regardless of
    // view, same principle as THE TOA keeping its utility knobs outside the
    // pedal takeover's footprint.
    gateKnob.setVisible (true);
    output.setVisible (true);

    tabDisplay.setVisible (! mainView);
}

void TheBowottoAudioProcessorEditor::mouseDown (const juce::MouseEvent& e)
{
    for (int i = 0; i < kNumViews; ++i)
    {
        if (viewTabBounds[(size_t) i].contains (e.position.toFloat()))
        {
            setCurrentView (i);
            return;
        }
    }
}

//==============================================================================
juce::Image TheBowottoAudioProcessorEditor::renderBrushedTexture (int width, int height)
{
    juce::Image img (juce::Image::ARGB, juce::jmax (1, width), juce::jmax (1, height), true);

    juce::Graphics g (img);
    juce::Random rnd (0xb0b0770);

    const int strokes = width * height / 34;
    for (int i = 0; i < strokes; ++i)
    {
        const float x   = rnd.nextFloat() * (float) width;
        const float y   = rnd.nextFloat() * (float) height;
        const float len = 5.0f + rnd.nextFloat() * 28.0f;

        g.setColour ((rnd.nextBool() ? juce::Colours::white : juce::Colours::black)
                         .withAlpha (0.016f + rnd.nextFloat() * 0.022f));
        g.drawLine (x, y, x + len, y, 1.0f);
    }
    return img;
}

void TheBowottoAudioProcessorEditor::drawScrew (juce::Graphics& g, juce::Point<float> centre,
                                                float angleDegrees)
{
    const float r = 6.5f;
    const auto rect = juce::Rectangle<float> (r * 2.0f, r * 2.0f).withCentre (centre);

    g.setColour (juce::Colours::black.withAlpha (0.5f));
    g.fillEllipse (rect.translated (0.0f, 1.5f));
    g.setGradientFill (juce::ColourGradient (juce::Colour (0xff6a6d74),
                                             centre.x - r * 0.35f, centre.y - r * 0.4f,
                                             juce::Colour (0xff2a2b30), centre.x + r, centre.y + r, true));
    g.fillEllipse (rect);
    g.setColour (juce::Colour (0xff0c0c0e));
    g.drawEllipse (rect, 1.0f);

    const float a = juce::degreesToRadians (angleDegrees);
    const float dx = std::cos (a) * (r - 2.0f), dy = std::sin (a) * (r - 2.0f);
    g.setColour (juce::Colour (0xff101114));
    g.drawLine (centre.x - dx, centre.y - dy, centre.x + dx, centre.y + dy, 1.8f);
}

//==============================================================================
void TheBowottoAudioProcessorEditor::paintTunerRibbon (juce::Graphics& g, juce::Rectangle<float> area)
{
    // Wide and thin — a single-row chromatic readout, not a big takeover
    // display. Sits at the bottom of the MAIN page, always visible there.
    static const char* noteNames[] = { "C", "C#", "D", "D#", "E", "F",
                                       "F#", "G", "G#", "A", "A#", "B" };

    const bool haveNote = tunerMidiNote >= 0;
    const bool inTune   = haveNote && std::abs (tunerCents) <= 5.0f;
    const auto green    = juce::Colour (0xff3ddc6a);

    // Glass strip background.
    g.setColour (juce::Colours::black.withAlpha (0.5f));
    g.fillRoundedRectangle (area.translated (0.0f, 2.0f), 8.0f);
    g.setGradientFill (juce::ColourGradient (glassTop, area.getX(), area.getY(),
                                             glassBottom, area.getX(), area.getBottom(), false));
    g.fillRoundedRectangle (area, 8.0f);
    g.setColour ((inTune ? green : dimText).withAlpha (0.4f));
    g.drawRoundedRectangle (area, 8.0f, 1.1f);

    // The cents scale fills the whole strip evenly, symmetric margins both
    // sides — no reserved note column sitting empty when nothing's playing.
    const float scaleL = area.getX() + 16.0f;
    const float scaleR = area.getRight() - 16.0f;
    const float scaleW = scaleR - scaleL;
    const float scaleY = area.getCentreY();

    // Note name + octave + Hz float over the left end of the scale only
    // when a note is actually detected.
    if (haveNote)
    {
        const auto name = juce::String (noteNames[tunerMidiNote % 12]);
        const auto oct  = juce::String (tunerMidiNote / 12 - 1);
        auto noteArea = area.withWidth (100.0f).reduced (10.0f, 5.0f);

        g.setFont (juce::Font (juce::FontOptions (20.0f, juce::Font::bold)));
        g.setColour (inTune ? green : text);
        g.drawText (name + oct, noteArea.withTrimmedBottom (12.0f), juce::Justification::centredLeft);

        g.setFont (juce::Font (juce::FontOptions (9.0f, juce::Font::bold)));
        g.setColour (dimText);
        g.drawText (juce::String (tunerHz, 1) + " Hz",
                    noteArea.withTrimmedTop (noteArea.getHeight() - 12.0f), juce::Justification::centredLeft);
    }

    g.setColour (juce::Colours::white.withAlpha (0.12f));
    g.drawLine (scaleL, scaleY, scaleR, scaleY, 1.0f);

    for (int c = -50; c <= 50; c += 10)
    {
        const float x = scaleL + scaleW * (float) (c + 50) / 100.0f;
        const bool major = c == 0 || std::abs (c) == 50;
        g.setColour (juce::Colours::white.withAlpha (major ? 0.4f : 0.15f));
        g.drawLine (x, scaleY - (major ? 6.0f : 3.5f), x, scaleY + (major ? 6.0f : 3.5f),
                    major ? 1.3f : 0.7f);
    }

    {
        const float zl = scaleL + scaleW * 45.0f / 100.0f;
        const float zr = scaleL + scaleW * 55.0f / 100.0f;
        g.setColour ((inTune ? green : juce::Colours::white).withAlpha (inTune ? 0.25f : 0.06f));
        g.fillRoundedRectangle (juce::Rectangle<float> (zl, scaleY - 6.0f, zr - zl, 12.0f), 3.0f);
    }

    if (haveNote)
    {
        const float clamped = juce::jlimit (-50.0f, 50.0f, tunerCents);
        const float nx = scaleL + scaleW * (clamped + 50.0f) / 100.0f;
        const auto needleCol = inTune ? green : violet;

        g.setColour (needleCol.withAlpha (0.35f));
        g.drawLine (nx, scaleY - 9.0f, nx, scaleY + 9.0f, 4.5f);
        g.setColour (needleCol);
        g.drawLine (nx, scaleY - 9.0f, nx, scaleY + 9.0f, 1.6f);

        g.setFont (juce::Font (juce::FontOptions (9.0f, juce::Font::bold)));
        g.setColour (dimText);
        g.drawText ((tunerCents >= 0 ? "+" : "") + juce::String (tunerCents, 1) + " ct",
                    juce::Rectangle<float> (scaleR - 42.0f, area.getY() + 3.0f, 42.0f, 11.0f),
                    juce::Justification::centredRight);
    }
}

//==============================================================================
void TheBowottoAudioProcessorEditor::paint (juce::Graphics& g)
{
    const float w = (float) getWidth(), h = (float) getHeight();

    // --- chassis: dark brushed steel, family standard -----------------------
    juce::ColourGradient base (chassisTop, 0.0f, 0.0f, chassisBottom, w * 0.35f, h, false);
    base.addColour (0.22, juce::Colour (0xff1a1a1e));
    base.addColour (0.55, juce::Colour (0xff141417));
    g.setGradientFill (base);
    g.fillAll();

    if (brushed.isValid())
        g.drawImageAt (brushed, 0, 0);

    // Ambient light: amber from the Muff corner, violet from the Bow corner.
    juce::ColourGradient ambL (amber.withAlpha (0.10f), w * 0.12f, h * 0.42f,
                               juce::Colours::transparentBlack, w * 0.55f, h * 0.9f, true);
    g.setGradientFill (ambL);
    g.fillAll();
    juce::ColourGradient ambR (violet.withAlpha (0.12f), w * 0.86f, h * 0.42f,
                               juce::Colours::transparentBlack, w * 0.4f, h * 0.95f, true);
    g.setGradientFill (ambR);
    g.fillAll();
    juce::ColourGradient vig (vignetteCore.withAlpha (0.45f), w * 0.5f, h * 0.5f,
                              juce::Colours::transparentBlack, w * 0.02f, h * 0.02f, true);
    g.setGradientFill (vig);
    g.fillAll();

    // --- Mellon Collie stars, etched into the metal like tatau --------------
    {
        juce::Random starRng (23);
        for (int i = 0; i < 30; ++i)
        {
            const float sx = starRng.nextFloat() * w;
            const float sy = starRng.nextFloat() * h;
            const float sr = 1.5f + starRng.nextFloat() * 4.5f;
            const float al = 0.10f + starRng.nextFloat() * 0.14f;
            g.setColour (gold.withAlpha (al));
            g.drawLine (sx - sr, sy, sx + sr, sy, 0.7f);
            g.drawLine (sx, sy - sr, sx, sy + sr, 0.7f);
            g.setColour (gold.withAlpha (al * 0.6f));
            g.drawLine (sx - sr * 0.5f, sy - sr * 0.5f, sx + sr * 0.5f, sy + sr * 0.5f, 0.5f);
            g.drawLine (sx - sr * 0.5f, sy + sr * 0.5f, sx + sr * 0.5f, sy - sr * 0.5f, 0.5f);
        }
    }

    // --- corner screws -------------------------------------------------------
    drawScrew (g, { 20.0f, 20.0f },      35.0f);
    drawScrew (g, { w - 20.0f, 20.0f },  70.0f);
    drawScrew (g, { 20.0f, h - 20.0f }, 110.0f);
    drawScrew (g, { w - 20.0f, h - 20.0f }, 20.0f);

    // --- branding ------------------------------------------------------------
    g.setFont (juce::Font (juce::FontOptions (34.0f, juce::Font::bold)));
    // Split title: BOW in violet-white glow, OTTO in amber — the name is the
    // two halves of the plugin.
    {
        const juce::String t1 = "THE BOW", t2 = "OTTO";
        juce::Font f (juce::FontOptions (34.0f, juce::Font::bold));
        const float x0 = 42.0f, y0 = 14.0f, ht = 40.0f;
        const float w1 = juce::GlyphArrangement::getStringWidth (f, t1);

        g.setColour (violetGlow.withAlpha (0.25f));
        g.drawText (t1, (int) x0 - 1, (int) y0 + 1, 400, (int) ht, juce::Justification::left);
        g.setColour (text);
        g.drawText (t1, (int) x0, (int) y0, 400, (int) ht, juce::Justification::left);

        g.setColour (amber.withAlpha (0.30f));
        g.drawText (t2, (int) (x0 + w1) - 1, (int) y0 + 1, 200, (int) ht, juce::Justification::left);
        g.setColour (amberGlow);
        g.drawText (t2, (int) (x0 + w1), (int) y0, 200, (int) ht, juce::Justification::left);
    }

    g.setColour (dimText);
    g.setFont (juce::Font (juce::FontOptions (11.0f)));
    g.drawText ("CORE FOCUS PRODUCTIONS   |   FUZZ INTO STRINGS",
                44, 52, 500, 14, juce::Justification::left);

    // Header rule: amber fading into violet, left to right.
    juce::ColourGradient rule (amber, 42.0f, 0.0f, violet, w - 42.0f, 0.0f, false);
    g.setGradientFill (rule);
    g.fillRect (juce::Rectangle<float> (42.0f, 72.0f, w - 84.0f, 1.6f));

    g.setColour (gold.withAlpha (0.8f));
    g.setFont (juce::Font (juce::FontOptions (11.0f)));
    g.drawText ("v0.3.0", (int) w - 100, 20, 64, 16, juce::Justification::right);

    // --- the two top view tabs: MAIN / PEDALS --------------------------------
    {
        static const char* viewNames[] = { "MAIN", "PEDALS" };

        for (int i = 0; i < kNumViews; ++i)
        {
            const auto r = viewTabBounds[(size_t) i];
            const bool active = i == currentView;
            const auto accent = i == 0 ? gold : amber;

            if (active)
            {
                g.setColour (accent.withAlpha (0.85f));
                g.fillRoundedRectangle (r, 4.0f);
                g.setColour (accent);
                g.drawRoundedRectangle (r, 4.0f, 1.3f);
            }
            else
            {
                g.setColour (juce::Colour (0xff0c0c10));
                g.fillRoundedRectangle (r, 4.0f);
                g.setColour (accent.withAlpha (0.35f));
                g.drawRoundedRectangle (r.reduced (0.5f), 4.0f, 1.0f);
            }

            g.setFont (juce::Font (juce::FontOptions (12.0f, juce::Font::bold)));
            g.setColour (active ? juce::Colours::black.withAlpha (0.85f) : dimText);
            g.drawText (viewNames[i], r, juce::Justification::centred);
        }
    }

    // --- MAIN view: section headings + glass morph display + tuner ribbon ----
    if (currentView == 0)
    {
        auto heading = [&] (const juce::String& t, float cx, float yy, juce::Colour c)
        {
            g.setFont (juce::Font (juce::FontOptions (14.0f, juce::Font::bold)));
            g.setColour (c.withAlpha (0.25f));
            g.drawText (t, (int) (cx - 100.0f), (int) yy + 1, 200, 18, juce::Justification::centred);
            g.setColour (c);
            g.drawText (t, (int) (cx - 100.0f), (int) yy, 200, 18, juce::Justification::centred);

            juce::ColourGradient hr (c.withAlpha (0.0f), cx - 95.0f, 0.0f,
                                     c.withAlpha (0.0f), cx + 95.0f, 0.0f, false);
            hr.addColour (0.5, c.withAlpha (0.5f));
            g.setGradientFill (hr);
            g.fillRect (juce::Rectangle<float> (cx - 95.0f, yy + 20.0f, 190.0f, 1.0f));
        };

        heading ("THE MUFF", 113.0f, 112.0f, amber);
        heading ("THE BOW",  776.0f, 112.0f, violet);

        // --- the glass display behind the morph emblem -----------------------
        const juce::Rectangle<float> glass (368.0f, 100.0f, 244.0f, 64.0f);
        g.setColour (juce::Colours::black.withAlpha (0.5f));
        g.fillRoundedRectangle (glass.translated (0.0f, 2.0f), 8.0f);
        g.setGradientFill (juce::ColourGradient (glassTop, glass.getX(), glass.getY(),
                                                 glassBottom, glass.getX(), glass.getBottom(), false));
        g.fillRoundedRectangle (glass, 8.0f);
        g.setColour (amber.interpolatedWith (violet, shownMorph).withAlpha (0.5f));
        g.drawRoundedRectangle (glass, 8.0f, 1.2f);
        g.setGradientFill (juce::ColourGradient (juce::Colours::white.withAlpha (0.06f),
                                                 glass.getX(), glass.getY(),
                                                 juce::Colours::transparentBlack,
                                                 glass.getX(), glass.getCentreY(), false));
        g.fillRoundedRectangle (glass.withTrimmedBottom (glass.getHeight() * 0.5f), 8.0f);

        drawMorphEmblem (g, glass.reduced (10.0f, 4.0f), shownMorph);

        // --- knob labels (MAIN view only) -------------------------------------
        g.setFont (juce::Font (juce::FontOptions (11.5f, juce::Font::bold)));
        for (auto& [comp, label] : knobLabels)
        {
            const auto b = comp->getBounds();
            g.setColour (dimText);
            g.drawText (label, b.getX() - 10, b.getBottom() - 4, b.getWidth() + 20, 14,
                        juce::Justification::centred);
        }

        // --- tuner ribbon: wide and thin, bottom of the MAIN page -------------
        paintTunerRibbon (g, tunerRibbonBounds);
    }

    // GATE / OUTPUT utility labels — always visible.
    g.setFont (juce::Font (juce::FontOptions (11.5f, juce::Font::bold)));
    g.setColour (dimText);
    {
        const auto gb = gateKnob.getBounds();
        g.drawText ("GATE", gb.getX() - 10, gb.getBottom() - 4, gb.getWidth() + 20, 14,
                    juce::Justification::centred);
        const auto ob = output.getBounds();
        g.drawText ("OUTPUT", ob.getX() - 10, ob.getBottom() - 4, ob.getWidth() + 20, 14,
                    juce::Justification::centred);
    }

    // Gate LED.
    const float gateDb = proc.uiGateDb.load (std::memory_order_relaxed);
    const bool  gateOpen = gateDb > -1.0f;
    const auto  led = juce::Rectangle<float> (7.0f, 7.0f)
                          .withCentre ({ (float) gateKnob.getRight() + 2.0f,
                                         (float) gateKnob.getY() + 8.0f });
    if (gateOpen)
    {
        g.setColour (amber.withAlpha (0.3f));
        g.fillEllipse (led.expanded (4.0f));
        g.setColour (amber);
    }
    else
        g.setColour (juce::Colour (0xff2a2b30));
    g.fillEllipse (led);

    // --- footer --------------------------------------------------------------
    g.setColour (juce::Colour (0xff121215));
    g.fillRect (0.0f, h - 26.0f, w, 26.0f);
}

//==============================================================================
void TheBowottoAudioProcessorEditor::drawMorphEmblem (juce::Graphics& g,
                                                      juce::Rectangle<float> area,
                                                      float m)
{
    // Guitar silhouette left, violin right, glowing with the morph position;
    // between them a run of dots that lights amber -> violet.
    auto drawInstrument = [&g] (juce::Rectangle<float> r, bool isViolin, float glow,
                                juce::Colour c)
    {
        juce::Path pth;
        const float cx = r.getCentreX();
        const float bodyTop = r.getY() + r.getHeight() * 0.34f;
        const float bodyBot = r.getBottom() - 2.0f;
        const float waist   = r.getWidth() * (isViolin ? 0.16f : 0.20f);
        const float hip     = r.getWidth() * (isViolin ? 0.30f : 0.36f);

        pth.startNewSubPath (cx, r.getY());
        pth.lineTo (cx, bodyTop);
        pth.startNewSubPath (cx, bodyTop);
        pth.cubicTo (cx - hip, bodyTop + 4.0f, cx - hip, bodyTop + 12.0f, cx - waist, bodyTop + 16.0f);
        pth.cubicTo (cx - hip - 3.0f, bodyTop + 22.0f, cx - hip - 2.0f, bodyBot - 2.0f, cx, bodyBot);
        pth.cubicTo (cx + hip + 2.0f, bodyBot - 2.0f, cx + hip + 3.0f, bodyTop + 22.0f, cx + waist, bodyTop + 16.0f);
        pth.cubicTo (cx + hip, bodyTop + 12.0f, cx + hip, bodyTop + 4.0f, cx, bodyTop);

        if (glow > 0.35f)
        {
            g.setColour (c.withAlpha ((glow - 0.35f) * 0.45f));
            g.strokePath (pth, juce::PathStrokeType (4.0f, juce::PathStrokeType::curved));
        }
        g.setColour (c.withAlpha (0.25f + 0.75f * glow));
        g.strokePath (pth, juce::PathStrokeType (1.5f));

        if (isViolin)
        {
            g.drawLine (cx - waist * 0.7f, bodyTop + 18.0f, cx - waist * 0.5f, bodyBot - 8.0f, 1.0f);
            g.drawLine (cx + waist * 0.7f, bodyTop + 18.0f, cx + waist * 0.5f, bodyBot - 8.0f, 1.0f);
        }
        else
            g.drawLine (cx - waist * 0.8f, bodyTop + 20.0f, cx + waist * 0.8f, bodyTop + 20.0f, 1.3f);
    };

    auto left  = area.removeFromLeft (56.0f);
    auto right = area.removeFromRight (56.0f);

    drawInstrument (left,  false, 1.0f - m, amberGlow);
    drawInstrument (right, true,  m,        violetGlow);

    // The morph ladder between them.
    const int   dots = 9;
    const float y = area.getCentreY();
    for (int i = 0; i < dots; ++i)
    {
        const float t  = (float) i / (float) (dots - 1);
        const float dx = area.getX() + t * area.getWidth();
        const bool  lit = std::abs (t - m) < 0.5f / (float) (dots - 1)
                          || (m > 0.999f && i == dots - 1) || (m < 0.001f && i == 0);
        const auto  c = amber.interpolatedWith (violet, t);

        if (lit)
        {
            g.setColour (c.withAlpha (0.35f));
            g.fillEllipse (dx - 5.0f, y - 5.0f, 10.0f, 10.0f);
        }
        g.setColour (c.withAlpha (lit ? 1.0f : 0.28f));
        g.fillEllipse (dx - 2.2f, y - 2.2f, 4.4f, 4.4f);
    }
}

//==============================================================================
void TheBowottoAudioProcessorEditor::resized()
{
    const int knob = 72, big = 170;

    // --- the two top view tabs -------------------------------------------------
    const float tabW = 112.0f, tabH = 24.0f, tabGap = 8.0f;
    const float tabsTotal = tabW * (float) kNumViews + tabGap * (float) (kNumViews - 1);
    const float tabStartX = ((float) getWidth() - tabsTotal) * 0.5f;

    for (int i = 0; i < kNumViews; ++i)
        viewTabBounds[(size_t) i] = { tabStartX + (float) i * (tabW + tabGap), 80.0f, tabW, tabH };

    // THE MUFF (left)
    muffOn.setBounds  (39, 142, 66, 24);
    sustain.setBounds (36, 176, knob, knob);
    tone.setBounds    (118, 176, knob, knob);
    scoop.setBounds   (36, 278, knob, knob);
    gain.setBounds    (118, 278, knob, knob);

    // MORPH (centre)
    morph.setBounds   (405, 190, big, big);

    // THE BOW (right)
    swell.setBounds   (660, 172, knob, knob);
    force.setBounds   (740, 172, knob, knob);
    vibrato.setBounds (820, 172, knob, knob);
    rosin.setBounds   (700, 272, knob, knob);
    section.setBounds (780, 272, knob, knob);
    body.setBounds    (734, 364, 84, 26);

    // Utility knobs (always visible, outside the takeover footprint).
    gateKnob.setBounds (900, 140, 70, 70);
    output.setBounds   (900, 260, 70, 70);

    // TUNER ribbon: wide and thin, centred on the full chassis width (not
    // just the knob span) and pushed down near the footer.
    tunerRibbonBounds = { ((float) getWidth() - 640.0f) * 0.5f, 434.0f, 640.0f, 48.0f };

    // PEDALS TAKEOVER PANEL — occupies the exact footprint of the MAIN
    // knobs above (24..874, 104..484), never piled on top of them.
    tabDisplay.setBounds (24, 104, 850, 380);
}
