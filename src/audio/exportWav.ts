export type ExportNote = { id: number; step: number; pitch: number; duration?: number; velocity?: number }

type ExportClip = { lane: number; duration: number; startBar?: number }

type ExportOptions = {
  bpm: number
  master: number
  steps: boolean[][]
  notes: ExportNote[]
  clips: ExportClip[]
  channelLevels?: number[]
  referenceAudio?: AudioBuffer
  bars?: number
  selectedInstrument?: string
}

function addDrum(ctx: OfflineAudioContext, time: number, row: number, master: number, channelLevel: number) {
  const out = ctx.createGain()
  out.gain.value = Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, channelLevel / 100)) * 0.8
  out.connect(ctx.destination)

  if (row === 0 || row === 3) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = row === 0 ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(row === 0 ? 145 : 230, time)
    osc.frequency.exponentialRampToValueAtTime(row === 0 ? 48 : 115, time + (row === 0 ? 0.12 : 0.08))
    env.gain.setValueAtTime(0.0001, time)
    env.gain.exponentialRampToValueAtTime(row === 0 ? 0.85 : 0.35, time + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, time + (row === 0 ? 0.22 : 0.12))
    osc.connect(env).connect(out)
    osc.start(time)
    osc.stop(time + (row === 0 ? 0.23 : 0.13))
    return
  }

  const length = Math.floor(ctx.sampleRate * (row === 1 ? 0.16 : 0.055))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const env = ctx.createGain()
  noise.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.value = row === 1 ? 1400 : 6500
  env.gain.setValueAtTime(0.0001, time)
  env.gain.exponentialRampToValueAtTime(row === 1 ? 0.5 : 0.28, time + 0.003)
  env.gain.exponentialRampToValueAtTime(0.0001, time + (row === 1 ? 0.15 : 0.05))
  noise.connect(filter).connect(env).connect(out)
  noise.start(time)
  noise.stop(time + (row === 1 ? 0.16 : 0.06))
}

function addBass(ctx: OfflineAudioContext, time: number, pitch: number, master: number, channelLevel: number) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  osc.type = 'sawtooth'
  osc.frequency.value = 55 * Math.pow(2, pitch / 12)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(420, time)
  filter.frequency.exponentialRampToValueAtTime(180, time + 0.18)
  env.gain.setValueAtTime(0.0001, time)
  env.gain.exponentialRampToValueAtTime(0.16 * master / 100 * Math.max(0, Math.min(1, channelLevel / 100)), time + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.19)
  osc.connect(filter).connect(env).connect(ctx.destination)
  osc.start(time)
  osc.stop(time + 0.2)
}

function addNote(ctx: OfflineAudioContext, time: number, pitch: number, master: number, channelLevel: number, duration: number, velocity: number, selectedInstrument = 'Soft Keys') {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  const presets: Record<string, {wave: OscillatorType; cutoff: number; gain: number; octave: number; attack: number; release: number}> = {
    'Deep Kick': {wave:'sine', cutoff:260, gain:0.34, octave:-12, attack:0.006, release:0.16},
    'Warm Bass': {wave:'sawtooth', cutoff:520, gain:0.22, octave:-12, attack:0.012, release:0.1},
    'Soft Keys': {wave:'triangle', cutoff:2400, gain:0.14, octave:0, attack:0.025, release:0.18},
    'Air Texture': {wave:'sine', cutoff:5200, gain:0.12, octave:12, attack:0.08, release:0.32},
  }
  const preset = presets[selectedInstrument] ?? presets['Soft Keys']
  osc.type = preset.wave
  osc.frequency.value = 440 * Math.pow(2, (60 + pitch + preset.octave - 69) / 12)
  filter.type = 'lowpass'
  filter.frequency.value = preset.cutoff
  env.gain.setValueAtTime(0.0001, time)
  const noteDuration = Math.max(0.04, Math.min(2, duration))
  env.gain.exponentialRampToValueAtTime(preset.gain * master / 100 * Math.max(0, Math.min(1, channelLevel / 100)) * Math.max(0, Math.min(1, velocity / 127)), time + preset.attack)
  env.gain.setTargetAtTime(0.0001, time + Math.max(0.03, noteDuration - preset.release), Math.max(0.025, preset.release / 4))
  osc.connect(filter).connect(env).connect(ctx.destination)
  osc.start(time)
  osc.stop(time + noteDuration)
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytesPerSample = 2
  const dataSize = frames * channels * bytesPerSample
  const output = new ArrayBuffer(44 + dataSize)
  const view = new DataView(output)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  let offset = 44
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([output], { type: 'audio/wav' })
}

export async function exportArrangementWav({ bpm, master, steps, notes, clips, channelLevels = [78, 66, 72, 55, 60], referenceAudio, bars = 8, selectedInstrument = 'Soft Keys' }: ExportOptions): Promise<void> {
  const safeBpm = Math.max(40, Math.min(240, bpm))
  const safeBars = Math.max(1, Math.min(16, Math.floor(bars)))
  const secondsPerStep = 60 / safeBpm / 4
  const noteTail = Math.max(0.4, ...notes.map(note => (note.duration ?? 2) * secondsPerStep))
  const duration = safeBars * 4 * 60 / safeBpm + noteTail
  const sampleRate = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const totalSteps = safeBars * 16
  if (referenceAudio) {
    const referenceClip = clips.find(clip => clip.lane === 2)
    if (referenceClip) {
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = referenceAudio
      gain.gain.value = Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, (channelLevels[4] ?? 100) / 100))
      source.connect(gain).connect(ctx.destination)
      source.start(Math.max(0, (referenceClip.startBar ?? 0) * 4 * 60 / safeBpm))
    }
  }
  const activeAt = (lane: number, bar: number) => clips.some(clip => {
    const start = clip.startBar ?? 0
    return clip.lane === lane && bar >= start && bar < start + Math.max(1, Math.ceil(clip.duration))
  })

  for (let step = 0; step < totalSteps; step++) {
    const time = step * secondsPerStep
    const patternStep = step % 16
    const bar = Math.floor(step / 16)
    if (activeAt(0, bar)) {
      steps.forEach((row, rowIndex) => {
        if (row[patternStep]) addDrum(ctx, time, rowIndex, master, channelLevels[rowIndex === 0 ? 0 : 1] ?? 100)
      })
    }
    if (activeAt(1, bar) && [0, 6, 8, 14].includes(patternStep)) {
      addBass(ctx, time, patternStep % 8 === 0 ? 0 : 3, master, channelLevels[2] ?? 100)
    }
    if (activeAt(3, bar)) {
      notes.filter(note => note.step === patternStep).forEach(note => addNote(ctx, time, note.pitch, master, channelLevels[3] ?? 100, (note.duration ?? 2) * secondsPerStep, note.velocity ?? 100, selectedInstrument))
    }
  }

  const rendered = await ctx.startRendering()
  const blob = encodeWav(rendered)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `afrostudio-arrangement-${safeBpm}bpm-${safeBars}bars.wav`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
