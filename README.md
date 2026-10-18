# AfroStudio AI

A free-first, Windows-focused music production studio inspired by familiar DAW workflows, with Afro House tools and an AI reference-track workflow.

## Current milestone

The project is an early, actively developed browser-based studio foundation. The current branch includes:

- Playlist with draggable pattern/audio clips, whole-bar clip resizing from the right edge, a horizontally scrollable 16-bar timeline, click-to-seek playhead, arrangement-length-aware playback, tempo control, and transport.
- Local browser audio playback for synthesized drum patterns, bass/melody notes, and an imported reference track.
- 16-step Channel Rack and Piano Roll with selectable notes, drag-to-move pitch/time editing on a 1-step grid, right-edge note resizing, adjustable step-length and velocity, and note deletion.
- Mixer level controls and mute toggles for the available preview channels; WAV export honors channel mute states.
- Four lightweight selectable synth presets (Deep Kick, Warm Bass, Soft Keys, Air Texture) change Piano Roll playback and are included in WAV export and project save/load.
- Starter playback effects that can be toggled on/off: low-cut filter, dynamics compressor, short echo, and tempo-synced delay.
- JSON project export/import and WAV arrangement export that automatically extends up to 16 bars to cover the current clip arrangement.
- Local procedural Afro House idea generation (patterns and notes); this is not a trained AI music-generation model.
- Experimental reference-audio analysis estimates tempo and a rough transient-density profile locally; the profile and Groove, Style, and Originality controls influence generated hat/percussion patterns and note choices. This is a lightweight heuristic, not trained AI, genre recognition, key detection, or audio-to-audio remixing.
- Reference Track includes a configurable local-engine health check, designed to test a future local AI service without sending audio to a paid API. It only checks a `/health` endpoint returning `{\"status\":\"ok\"}` or `{\"status\":\"healthy\"}`; it does not install a model or generate audio.
- Keyboard shortcuts for transport, navigation, undo/redo, duplication, save, and deleting the selected Playlist clip or Piano Roll note. Ctrl/Cmd+B duplicates the selected Playlist clip into the next available bars, or duplicates clips into the second half when none is selected.

## Known limitations

- This is not yet a replacement for FL Studio; audio scheduling and the interface still need further development and testing.
- Reference analysis is still limited to a heuristic BPM estimate and rough transient-density profile. Key detection, stem separation, detailed musical-structure analysis, and audio-to-audio generation are not implemented.
- AI reference-track controls currently help shape locally generated patterns; they do not generate a full song from uploaded audio. The local-engine connection panel is only a health check: the engine, model installer, and generation API are not yet implemented.
- The built-in effects are lightweight starter processing, not a polished per-channel effects rack; reverb is currently approximated with a short echo, and effect parameters/routing are not yet editable.
- VST3/plugin hosting, sample library management, automation, MIDI snap customization, advanced MIDI editing, and a low-latency desktop audio engine remain future milestones.
- The app is currently a Vite web app. Desktop packaging is a later milestone.

## Product principles

- Familiar DAW workflow: Playlist, Piano Roll, Channel Rack, Mixer, and plugin-oriented design.
- Audio import and drag-and-drop are first-class workflows.
- Reference analysis should help create original music with related musical characteristics, not clone protected recordings.
- Prefer local and appropriately licensed tools; no mandatory paid generation API.
- Respect third-party software licenses and use independently written implementations.
- Be honest about which features are working and which are planned.

## Development

The initial stack is React, TypeScript, and Vite. Run `npm install` then `npm run dev` for local development; run `npm run build` for the TypeScript and production build check.
