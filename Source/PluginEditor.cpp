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
    const auto accent = b.getComponentID() == "violet" ? violet : amber;

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
    addKnob (echoTime, "echotime","TIME",    amber);
    addKnob (echoFb,   "echofb",  "FEED",    amber);
    addKnob (echoMix,  "echomix", "MIX",     amber);
    addKnob (reverbSize, "reverbsize", "SIZE", violet);
    addKnob (reverbMix,  "reverbmix",  "MIX",  violet);
    addKnob (output,   "output",  "OUTPUT",  amber);

    reverbOn.setComponentID ("violet");
    for (auto* t : { &muffOn, &echoOn, &reverbOn })
        addAndMakeVisible (*t);

    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (proc.apvts, "muffon",   muffOn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (proc.apvts, "echoon",   echoOn));
    buttonAttachments.push_back (std::make_unique<ButtonAttachment> (proc.apvts, "reverbon", reverbOn));

    body.addItemList ({ "VIOLIN", "VIOLA", "CELLO" }, 1);
    addAndMakeVisible (body);
    bodyAttachment = std::make_unique<ComboAttachment> (proc.apvts, "body", body);

    setSize (980, 560);
    brushed = renderBrushedTexture (980, 560);

    // Seed the morph readout from the PARAMETER, not the audio-thread tap —
    // the tap is only fresh once audio runs, and the editor can open first.
    shownMorph = proc.apvts.getRawParameterValue ("morph")->load() * 0.01f;
    morph.setColour (juce::Slider::rotarySliderFillColourId,
                     BowottoColours::amber.interpolatedWith (BowottoColours::violet, shownMorph));
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
    if (std::abs (m - shownMorph) > 0.004f)
    {
        shownMorph = m;
        // The centre knob's glow crossfades fuzz-amber into string-violet.
        morph.setColour (juce::Slider::rotarySliderFillColourId,
                         amber.interpolatedWith (violet, m));
        repaint();
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
    g.drawText ("CORE FOCUS PRODUCTIONS   |   FUZZ INTO STRINGS   |   FOR OTTO",
                44, 52, 500, 14, juce::Justification::left);

    // Header rule: amber fading into violet, left to right.
    juce::ColourGradient rule (amber, 42.0f, 0.0f, violet, w - 42.0f, 0.0f, false);
    g.setGradientFill (rule);
    g.fillRect (juce::Rectangle<float> (42.0f, 72.0f, w - 84.0f, 1.6f));

    g.setColour (gold.withAlpha (0.8f));
    g.setFont (juce::Font (juce::FontOptions (11.0f)));
    g.drawText ("v0.2.1", (int) w - 100, 20, 64, 16, juce::Justification::right);

    // --- section headings ----------------------------------------------------
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

    heading ("THE MUFF",  152.0f,  92.0f, amber);
    heading ("THE BOW",   806.0f,  92.0f, violet);
    heading ("TAPE ECHO", 255.0f, 396.0f, amber);
    heading ("REVERB",    565.0f, 396.0f, violet);

    // --- the glass display behind the morph emblem ---------------------------
    {
        const juce::Rectangle<float> glass (368.0f, 86.0f, 244.0f, 64.0f);
        g.setColour (juce::Colours::black.withAlpha (0.5f));
        g.fillRoundedRectangle (glass.translated (0.0f, 2.0f), 8.0f);
        g.setGradientFill (juce::ColourGradient (glassTop, glass.getX(), glass.getY(),
                                                 glassBottom, glass.getX(), glass.getBottom(), false));
        g.fillRoundedRectangle (glass, 8.0f);
        g.setColour (amber.interpolatedWith (violet, shownMorph).withAlpha (0.5f));
        g.drawRoundedRectangle (glass, 8.0f, 1.2f);
        // glass sheen
        g.setGradientFill (juce::ColourGradient (juce::Colours::white.withAlpha (0.06f),
                                                 glass.getX(), glass.getY(),
                                                 juce::Colours::transparentBlack,
                                                 glass.getX(), glass.getCentreY(), false));
        g.fillRoundedRectangle (glass.withTrimmedBottom (glass.getHeight() * 0.5f), 8.0f);

        drawMorphEmblem (g, glass.reduced (10.0f, 4.0f), shownMorph);
    }

    // --- knob labels ---------------------------------------------------------
    g.setFont (juce::Font (juce::FontOptions (11.5f, juce::Font::bold)));
    for (auto& [comp, label] : knobLabels)
    {
        const auto b = comp->getBounds();
        g.setColour (dimText);
        g.drawText (label, b.getX() - 10, b.getBottom() - 4, b.getWidth() + 20, 14,
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
    g.setColour (dimText.withAlpha (0.7f));
    g.setFont (juce::Font (juce::FontOptions (10.5f)));
    g.drawText ("TWELFTH IN THE FAMILY  |  THE ORION PACK",
                0, (int) h - 24, (int) w - 16, 16, juce::Justification::right);
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
    const int knob = 78, big = 170;

    // THE MUFF (left)
    muffOn.setBounds  (56, 122, 66, 24);
    sustain.setBounds (36, 156, knob, knob);
    tone.setBounds    (130, 156, knob, knob);
    scoop.setBounds   (36, 258, knob, knob);
    gain.setBounds    (130, 258, knob, knob);

    // MORPH (centre)
    morph.setBounds   (405, 158, big, big);
    gateKnob.setBounds(460, 330, 60, 60);

    // THE BOW (right)
    // Three over two: BOW joins the top row as the primary timbre control.
    swell.setBounds   (664, 152, knob, knob);
    force.setBounds   (756, 152, knob, knob);
    vibrato.setBounds (848, 152, knob, knob);
    rosin.setBounds   (710, 252, knob, knob);
    section.setBounds (802, 252, knob, knob);
    body.setBounds    ((664 + 848 + knob) / 2 - 42, 344, 84, 26);

    // bottom strip
    echoOn.setBounds   (92, 432, 64, 24);
    echoTime.setBounds (168, 420, 62, 62);
    echoFb.setBounds   (240, 420, 62, 62);
    echoMix.setBounds  (312, 420, 62, 62);

    reverbOn.setBounds   (452, 432, 64, 24);
    reverbSize.setBounds (528, 420, 62, 62);
    reverbMix.setBounds  (600, 420, 62, 62);

    output.setBounds (846, 412, knob, knob);
}
