cmake_minimum_required(VERSION 3.22)

# Universal binary — must be set before project(). Not optional: Ableton Live
# 11.0.x is an Intel app running under Rosetta; a Rosetta host cannot load an
# arm64-only plugin and it simply never appears after a rescan.
if(APPLE AND NOT DEFINED CMAKE_OSX_ARCHITECTURES)
    set(CMAKE_OSX_ARCHITECTURES "x86_64;arm64"
        CACHE STRING "Build for both Intel and Apple Silicon")
endif()

# C alongside CXX: juce_audio_formats compiles FLAC/Ogg from C sources.
project(TheBowotto VERSION 0.2.1 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# JUCE — reuse a local clone when given (The Forge's build tree has one at
# ../the-forge/build/_deps/juce-src), otherwise fetch the pinned tag.
# ---------------------------------------------------------------------------
set(JUCE_PATH "" CACHE STRING "Path to a local JUCE clone (optional)")

if(JUCE_PATH)
    message(STATUS "Using local JUCE at ${JUCE_PATH}")
    add_subdirectory(${JUCE_PATH} JUCE)
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        8.0.4          # pinned — bump deliberately, never accidentally
        GIT_SHALLOW    TRUE)
    FetchContent_MakeAvailable(JUCE)
endif()

# ---------------------------------------------------------------------------
# Plugin target
# ---------------------------------------------------------------------------
juce_add_plugin(TheBowotto
    COMPANY_NAME                "Core Focus Productions"
    BUNDLE_ID                   com.corefocusproductions.thebowotto
    IS_SYNTH                    FALSE
    NEEDS_MIDI_INPUT            FALSE
    NEEDS_MIDI_OUTPUT           FALSE
    IS_MIDI_EFFECT              FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD     TRUE
    PLUGIN_MANUFACTURER_CODE    Cfpr
    PLUGIN_CODE                 Bwot
    FORMATS                     VST3 AU Standalone
    PRODUCT_NAME                "The Bowotto")

target_sources(TheBowotto PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_include_directories(TheBowotto PRIVATE Source)

target_compile_definitions(TheBowotto PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_REPORT_APP_USAGE=0)

target_link_libraries(TheBowotto
    PUBLIC
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

# ---------------------------------------------------------------------------
# Snapshot tool — editor straight to PNG, no host, no rescans.
# ---------------------------------------------------------------------------
option(BOWOTTO_BUILD_SNAPSHOT "Build the editor snapshot tool" ON)

if(BOWOTTO_BUILD_SNAPSHOT)
    add_executable(BowottoSnapshot Tools/Snapshot.cpp)
    target_include_directories(BowottoSnapshot PRIVATE Source)
    target_link_libraries(BowottoSnapshot PRIVATE TheBowotto)
endif()

# ---------------------------------------------------------------------------
# Test bench — offline DSP correctness + audibility tests.
# ---------------------------------------------------------------------------
option(BOWOTTO_BUILD_TESTS "Build the DSP test bench" ON)

if(BOWOTTO_BUILD_TESTS)
    add_executable(BowottoTests Tools/TestHarness.cpp)
    target_include_directories(BowottoTests PRIVATE Source)
    target_link_libraries(BowottoTests PRIVATE TheBowotto)
endif()
