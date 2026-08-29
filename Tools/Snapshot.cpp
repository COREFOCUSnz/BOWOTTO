/*
    Renders THE BOWOTTO's editor to a PNG without launching a host — one
    command instead of a rebuild + rescan + manual look. Family tool.
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

#include <iostream>

int main (int argc, char* argv[])
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    const juce::File out = argc > 1
        ? juce::File::getCurrentWorkingDirectory().getChildFile (juce::String (argv[1]))
        : juce::File::getCurrentWorkingDirectory().getChildFile ("bowotto-editor.png");

    constexpr double sampleRate = 48000.0;
    constexpr int    blockSize  = 512;

    TheBowottoAudioProcessor processor;
    processor.setRateAndBufferSizeDetails (sampleRate, blockSize);
    processor.prepareToPlay (sampleRate, blockSize);

    auto setParam = [&processor] (const char* id, float value)
    {
        if (auto* p = processor.apvts.getParameter (id))
            p->setValueNotifyingHost (p->convertTo0to1 (value));
    };

    // Park the panel mid-morph so both halves of the emblem read.
    setParam ("sustain", 70.0f);
    setParam ("tone",    45.0f);
    setParam ("morph",   50.0f);
    setParam ("swell",  350.0f);
    setParam ("section", 60.0f);

    auto editor = std::unique_ptr<juce::AudioProcessorEditor> (processor.createEditor());
    if (editor == nullptr)
    {
        std::cerr << "no editor\n";
        return 1;
    }

    editor->setOpaque (true);

    if (argc > 2)
        if (auto* e = dynamic_cast<TheBowottoAudioProcessorEditor*> (editor.get()))
            e->setCurrentView (std::atoi (argv[2]));

    juce::Image image (juce::Image::ARGB, editor->getWidth(), editor->getHeight(), true);
    juce::Graphics g (image);
    editor->paintEntireComponent (g, true);

    juce::PNGImageFormat png;
    juce::FileOutputStream stream (out);
    if (stream.failedToOpen() || ! png.writeImageToStream (image, stream))
    {
        std::cerr << "could not write " << out.getFullPathName() << "\n";
        return 1;
    }

    std::cout << "wrote " << out.getFullPathName() << " ("
              << editor->getWidth() << "x" << editor->getHeight() << ")\n";
    return 0;
}
