export type MidiNote = { step: number; pitch: number; duration: number; velocity: number }

const writeVlq = (value: number): number[] => {
  let buffer = value & 0x7f
  const bytes: number[] = []
  while ((value >>= 7) > 0) {
    buffer <<= 8
    buffer |= ((value & 0x7f) | 0x80)
  }
  while (true) {
    bytes.push(buffer & 0xff)
    if (buffer & 0x80) buffer >>= 8
    else break
  }
  return bytes
}

const pushText = (target: number[], value: string) => {
  for (let i = 0; i < value.length; i++) target.push(value.charCodeAt(i))
}

export function exportPianoRollMidi(notes: MidiNote[], bpm: number, filename = 'afrostudio-piano-roll.mid') {
  const ticksPerQuarter = 480
  const ticksPerStep = ticksPerQuarter / 4
  const tempo = Math.max(1, Math.round(60_000_000 / Math.max(1, bpm)))
  const events: { tick: number; order: number; bytes: number[] }[] = []

  for (const note of notes) {
    const start = Math.max(0, Math.round(note.step * ticksPerStep))
    const end = start + Math.max(1, Math.round(note.duration * ticksPerStep))
    const midiPitch = Math.max(0, Math.min(127, 60 + Math.round(note.pitch)))
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)))
    events.push({ tick: start, order: 1, bytes: [0x90, midiPitch, velocity] })
    events.push({ tick: end, order: 0, bytes: [0x80, midiPitch, 0] })
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order)
  const track: number[] = [0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]
  let previousTick = 0
  for (const event of events) {
    track.push(...writeVlq(event.tick - previousTick), ...event.bytes)
    previousTick = event.tick
  }
  track.push(0x00, 0xff, 0x2f, 0x00)

  const bytes: number[] = []
  pushText(bytes, 'MThd')
  bytes.push(0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff)
  pushText(bytes, 'MTrk')
  const length = track.length
  bytes.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...track)

  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
