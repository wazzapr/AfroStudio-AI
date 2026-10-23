export type SoundFontInstrument = {
  name: string
  category: string
  program: number
  color: 'lime' | 'purple' | 'cyan' | 'orange'
}

export const SOUND_FONT_INSTRUMENTS: SoundFontInstrument[] = [
  { name: 'Grand Piano', category: 'PIANO', program: 0, color: 'cyan' },
  { name: 'Electric Piano', category: 'KEYS', program: 4, color: 'purple' },
  { name: 'Music Box', category: 'MALLET', program: 10, color: 'orange' },
  { name: 'Marimba', category: 'MALLET', program: 12, color: 'orange' },
  { name: 'Church Organ', category: 'ORGAN', program: 19, color: 'purple' },
  { name: 'Nylon Guitar', category: 'GUITAR', program: 24, color: 'orange' },
  { name: 'Steel Guitar', category: 'GUITAR', program: 25, color: 'orange' },
  { name: 'Overdriven Guitar', category: 'GUITAR', program: 29, color: 'orange' },
  { name: 'Acoustic Bass', category: 'BASS', program: 32, color: 'lime' },
  { name: 'Finger Bass', category: 'BASS', program: 33, color: 'lime' },
  { name: 'Fretless Bass', category: 'BASS', program: 35, color: 'lime' },
  { name: 'Slap Bass', category: 'BASS', program: 36, color: 'lime' },
  { name: 'Synth Bass', category: 'BASS', program: 38, color: 'purple' },
  { name: 'Violin', category: 'STRINGS', program: 40, color: 'orange' },
  { name: 'Cello', category: 'STRINGS', program: 42, color: 'orange' },
  { name: 'Orchestral Harp', category: 'HARP', program: 46, color: 'orange' },
  { name: 'Warm Strings', category: 'STRINGS', program: 48, color: 'orange' },
  { name: 'Synth Strings', category: 'SYNTH STRINGS', program: 50, color: 'purple' },
  { name: 'Choir Aahs', category: 'VOCAL', program: 52, color: 'cyan' },
  { name: 'Voice Oohs', category: 'VOCAL', program: 53, color: 'cyan' },
  { name: 'Synth Voice', category: 'VOCAL SYNTH', program: 54, color: 'purple' },
  { name: 'Trumpet', category: 'BRASS', program: 56, color: 'cyan' },
  { name: 'French Horn', category: 'BRASS', program: 60, color: 'orange' },
  { name: 'Synth Brass', category: 'SYNTH BRASS', program: 62, color: 'purple' },
  { name: 'Soprano Sax', category: 'SAXOPHONE', program: 64, color: 'orange' },
  { name: 'Oboe', category: 'WOODWIND', program: 68, color: 'cyan' },
  { name: 'Clarinet', category: 'WOODWIND', program: 71, color: 'cyan' },
  { name: 'Flute', category: 'WOODWIND', program: 73, color: 'cyan' },
  { name: 'Pan Flute', category: 'WOODWIND', program: 75, color: 'cyan' },
  { name: 'Warm Pad', category: 'SYNTH PAD', program: 89, color: 'purple' },
  { name: 'Sitar', category: 'WORLD', program: 104, color: 'orange' },
  { name: 'Koto', category: 'WORLD', program: 107, color: 'orange' },
]

type WebAudioFontPreset = Record<string, unknown>
type WebAudioFontPlayerInstance = {
  loader: {
    startLoad: (context: AudioContext, url: string, variableName: string) => void
    waitLoad: (callback: () => void) => void
  }
  queueWaveTable: (
    context: AudioContext,
    destination: AudioNode,
    preset: WebAudioFontPreset,
    when: number,
    pitch: number,
    duration: number,
    volume: number,
  ) => unknown
}

declare global {
  interface Window {
    WebAudioFontPlayer?: new () => WebAudioFontPlayerInstance
  }
}

const REMOTE_PLAYER_URL = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js'
const PLAYER_URL = window.location.search.includes('desktop=1')
  ? new URL('./vendor/WebAudioFontPlayer.js', document.baseURI).href
  : REMOTE_PLAYER_URL
const REMOTE_DATA_URL = 'https://surikov.github.io/webaudiofontdata/sound/'
// Packaged Electron builds ship these starter samples alongside the app. The development browser still uses the public library.
const DATA_URL = window.location.search.includes('desktop=1')
  ? new URL('./soundfonts/', document.baseURI).href
  : REMOTE_DATA_URL
const playerScripts = new Map<string, Promise<void>>()
const players = new WeakMap<AudioContext, WebAudioFontPlayerInstance>()
const loadedPresets = new WeakMap<AudioContext, Map<number, Promise<WebAudioFontPreset>>>()
const readyPresets = new WeakMap<AudioContext, Set<number>>()
const presetData = new WeakMap<AudioContext, Map<number, WebAudioFontPreset>>()

function loadScript(url: string): Promise<void> {
  const existing = playerScripts.get(url)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not download the sample instrument engine. Check your internet connection.'))
    document.head.appendChild(script)
  })
  playerScripts.set(url, promise)
  return promise
}

async function getPlayer(context: AudioContext): Promise<WebAudioFontPlayerInstance> {
  const existing = players.get(context)
  if (existing) return existing
  await loadScript(PLAYER_URL)
  if (!window.WebAudioFontPlayer) throw new Error('The sample instrument engine did not start.')
  const player = new window.WebAudioFontPlayer()
  players.set(context, player)
  return player
}

export async function loadSoundFontInstrument(
  context: AudioContext,
  instrumentName: string,
): Promise<WebAudioFontPreset> {
  const instrument = SOUND_FONT_INSTRUMENTS.find(item => item.name === instrumentName)
  if (!instrument) throw new Error('This instrument does not use a SoundFont preset.')
  let contextPresets = loadedPresets.get(context)
  if (!contextPresets) {
    contextPresets = new Map()
    loadedPresets.set(context, contextPresets)
  }
  const cached = contextPresets.get(instrument.program)
  if (cached) return cached

  const promise = (async () => {
    const player = await getPlayer(context)
    const suffix = String(instrument.program * 10).padStart(4, '0')
    const variableName = '_tone_' + suffix + '_FluidR3_GM_sf2_file'
    const url = DATA_URL + suffix + '_FluidR3_GM_sf2_file.js'
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The instrument download timed out. Check your internet connection and try again.')), 45000)
      try {
        player.loader.startLoad(context, url, variableName)
        player.loader.waitLoad(() => {
          window.clearTimeout(timeout)
          const preset = (window as unknown as Record<string, unknown>)[variableName]
          if (preset && typeof preset === 'object') resolve()
          else reject(new Error('The sound library did not provide this instrument preset.'))
        })
      } catch (error) {
        window.clearTimeout(timeout)
        reject(error instanceof Error ? error : new Error('Could not load this instrument.'))
      }
    })
    const preset = (window as unknown as Record<string, WebAudioFontPreset>)[variableName]
    let ready = readyPresets.get(context)
    if (!ready) { ready = new Set(); readyPresets.set(context, ready) }
    ready.add(instrument.program)
    let data = presetData.get(context)
    if (!data) { data = new Map(); presetData.set(context, data) }
    data.set(instrument.program, preset)
    return preset
  })()
  contextPresets.set(instrument.program, promise)
  try {
    return await promise
  } catch (error) {
    contextPresets.delete(instrument.program)
    throw error
  }
}

export function isSoundFontInstrumentReady(context: AudioContext, instrumentName: string): boolean {
  const instrument = SOUND_FONT_INSTRUMENTS.find(item => item.name === instrumentName)
  return Boolean(instrument && readyPresets.get(context)?.has(instrument.program))
}

export function queueSoundFontNote(
  context: AudioContext,
  instrumentName: string,
  destination: AudioNode,
  pitch: number,
  duration: number,
  volume: number,
  when: number,
): void {
  const instrument = SOUND_FONT_INSTRUMENTS.find(item => item.name === instrumentName)
  const player = players.get(context)
  const preset = instrument ? presetData.get(context)?.get(instrument.program) : undefined
  if (!instrument || !player || !preset) throw new Error('The selected sampled instrument is not loaded yet.')
  player.queueWaveTable(context, destination, preset, Math.max(context.currentTime, when), Math.max(0, Math.min(127, Math.round(pitch))), Math.max(0.05, Math.min(8, duration)), Math.max(0, Math.min(1, volume)))
}

export async function playSoundFontNote(
  context: AudioContext,
  instrumentName: string,
  destination: AudioNode,
  pitch: number,
  duration: number,
  volume: number,
): Promise<void> {
  const [player, preset] = await Promise.all([
    getPlayer(context),
    loadSoundFontInstrument(context, instrumentName),
  ])
  player.queueWaveTable(
    context,
    destination,
    preset,
    context.currentTime,
    Math.max(0, Math.min(127, Math.round(pitch))),
    Math.max(0.05, Math.min(8, duration)),
    Math.max(0, Math.min(1, volume)),
  )
}
