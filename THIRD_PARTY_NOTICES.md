# Third-party sound assets

## FluidR3 General MIDI presets

AfroStudio AI's Windows installer build includes a starter set of 32 converted instrument presets derived from the FluidR3 General MIDI SoundFont by Frank Wen and contributors. The preset data is distributed through the WebAudioFont data project:

- WebAudioFont data: https://github.com/surikov/webaudiofontdata
- FluidR3 license reference: https://github.com/musescore/MuseScore/blob/deprecated_master/share/sound/FluidR3Mono_License.md
- Original FluidR3 project attribution: Frank Wen, copyright © 2000–2002, 2008.

The original FluidR3 SoundFont is released under the MIT license. The copyright and permission notice must accompany copies or substantial portions. The instrument presets are downloaded by the Windows installer workflow from the WebAudioFont data host and bundled into the installer so the sample data itself is available locally.

The bundled starter presets cover grand/electric piano, music box, marimba, church organ, nylon/steel/overdriven guitars, acoustic/finger/fretless/slap/synth basses, violin, cello, orchestral harp, warm/synth strings, choir aahs, voice oohs, synth voice, trumpet, French horn, synth brass, soprano sax, oboe, clarinet, flute, pan flute, warm pad, sitar, and koto.

## WebAudioFont playback engine

The current app loads the WebAudioFont playback engine from https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js at runtime. Its source and licensing terms are maintained at https://github.com/surikov/webaudiofont. The engine is not bundled into this starter sound pack.
