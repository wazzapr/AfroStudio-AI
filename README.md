# AfroStudio AI

A free-first, Windows-focused music production studio inspired by familiar DAW workflows, with Afro House tools and an AI reference-track workflow.

## Current milestone

The project is an early, actively developed desktop-capable studio foundation. Current features include:

- Playlist with draggable pattern/audio clips, transport, tempo control, and arrangement playback.
- Local browser audio playback for synthesized drum patterns, bass/melody notes, and an imported reference track.
- Channel Rack and Piano Roll editing, a searchable Instrument Rack with 32 sample-based General MIDI instruments (piano, electric piano, music box, marimba, organ, guitars, multiple basses, violin, cello, harp, strings, choir/voice, brass, saxophone, woodwinds, pads and world instruments), lightweight synth presets, project save/load, MIDI export and WAV arrangement export.
- A six-effect rack with low-cut EQ, compressor, short echo, tempo delay, generated reverb and chorus/vocal-doubler processing for instruments, drums and imported-audio preview. A simple vocal pitch/speed control is included; it changes playback speed too and is not a studio-quality independent pitch shifter.
- A Studio Assistant that can execute supported commands, including chained requests such as “set BPM to 120, load trumpet, enable reverb”. It can set tempo/master volume/vocal preview pitch, load instruments, enable effects, create clips, generate starter patterns and open studio pages. An optional local Ollama connector can translate natural-language requests into a safe list of these supported actions; the built-in command bot works without Ollama.
- Experimental local reference-audio analysis and an optional local Python bridge for a separately running ACE-Step API.
- Keyboard shortcuts for transport, navigation, undo/redo, duplication, save, and deleting selected items.
- An in-app Updates page that checks the latest source commit and looks for the published Windows installer. It can open the installer download, but you must close the app and run the installer manually; silent in-app replacement is not implemented.

## Studio Assistant and future cloud AI

The assistant supports action commands and an optional local language model. To enable more flexible natural-language planning, install Ollama separately and run `ollama pull qwen2.5:3b`, then turn on **Use local AI model (Ollama)** in the Assistant page. This model runs locally and does not require a paid API, but it downloads model files and may be slow on older CPUs. If Ollama is not running or the model is missing, switch the option off and use the built-in command bot. This is not a direct connection to your ChatGPT subscription. A future cloud-model connector would require a separately configured API key and may cost money.

## Windows setup status

A Windows desktop build is now being added with Electron. The Windows Installer workflow builds a setup `.exe`, bundles the local Python bridge into a standalone Windows executable, uploads a build artifact, and publishes a rolling `nightly` pre-release when the build succeeds. Installer builds are serialized so older commits do not race to overwrite the latest download. The packaged app serves its interface locally and starts the bridge automatically. The \`local-engine/setup-windows.ps1\` helper is an early setup step: it checks Python, disk space, and NVIDIA GPU information, prepares the local bridge environment, and can start the bridge.

**The helper does not install ACE-Step or download AI model weights yet.** We must verify a safe, compatible installation route before automating multi-gigabyte downloads. The current PC described by the project owner has a GTX 750 Ti with 2 GB VRAM; ACE-Step 1.5's documented low-memory recommendation is at least 4 GB, so compatibility cannot be promised. No paid generation API is required by the design.

## Known limitations

- Not yet a replacement for FL Studio; audio scheduling and the interface still need further development and testing.
- AI full-song generation from uploaded audio requires a compatible local model service; the bridge alone does not generate music.
- Native VST3 plugin hosting, deep synth design comparable to Omnisphere/Nexus, additional downloadable sound packs, automation, advanced independent vocal pitch-shifting, and a low-latency desktop audio engine remain future milestones.
- The Windows installer workflow downloads and bundles 32 FluidR3 General MIDI sample preset files and the WebAudioFont playback-engine script locally. These starter sounds are not a 50 GB Omnisphere-scale library, but desktop instrument playback should not need an internet connection for these bundled banks. The browser development version still loads sample data from upstream. Sound quality, exported WAV results and audio routing still need testing on a real Windows machine. Sound quality, exported WAV results and audio routing still need testing on a real Windows machine.
- The desktop installer bundles the studio interface and a standalone local bridge executable, so the bridge does not require a separate Python installation. It does not install an AI music-generation model, and the installer still needs testing on a real Windows PC.

## Try it on Windows

To get the latest Windows installer, open the [AfroStudio AI Nightly release](https://github.com/wazzapr/AfroStudio-AI/releases/tag/nightly) and download `AfroStudio-AI-Setup-0.1.0.exe`. You can also use the [Windows installer workflow](https://github.com/wazzapr/AfroStudio-AI/actions/workflows/windows-installer.yml) to see build status. If the nightly release does not exist or has no installer asset yet, wait for a successful workflow run and refresh. Run the `.exe` and follow the setup prompts. This is an early testing build; it bundles the bridge but does not install the AI model.

To try the latest source on Windows without the installer:

1. Download the [latest project ZIP](https://github.com/wazzapr/AfroStudio-AI/archive/refs/heads/feat/studio-foundation.zip).
2. Extract the ZIP to a normal folder, for example `Desktop\AfroStudio-AI`.
3. Make sure Node.js LTS is installed from [nodejs.org](https://nodejs.org/).
4. Open the extracted folder and double-click `START-AFROSTUDIO-WINDOWS.bat`.
5. On first launch, the script runs `npm install`, which needs an internet connection. When the app starts, it opens `http://127.0.0.1:5173` in your browser.
6. Keep the black command window open while using the app. Press `Ctrl+C` there to stop it.

If Windows SmartScreen warns about a script downloaded from the internet, only run it if you downloaded the ZIP from this official repository and are comfortable reviewing the script first. The launcher runs project dependency installation and starts the local Vite development server; it is **not** a standalone installer and does not install the AI music model.

## Development

The initial stack is React, TypeScript, and Vite. Run `npm install`, then `npm run dev`; run `npm run build` for the TypeScript and production build check.
