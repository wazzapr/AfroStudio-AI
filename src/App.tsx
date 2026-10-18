import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AudioWaveform, Bot, Check, ChevronDown, Copy, Disc3, Download, Drum, FileAudio, FolderOpen, Layers3, Music2, Pause, Play, Plus, Redo2, Save, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, Undo2, Upload, Volume2, Waves, WandSparkles, X } from 'lucide-react'
import { exportArrangementWav } from './audio/exportWav'

type Clip = { id: number; name: string; duration: number; color: string; lane: number; startBar?: number }
type DrumSample = { id: string; name: string; buffer: AudioBuffer; url: string; duration: number }
type StoredDrumSample = { id: string; name: string; blob: Blob }
const sampleDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('afrostudio-local-samples', 1)
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('samples')) request.result.createObjectStore('samples', { keyPath: 'id' }) }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Could not open local sample storage.'))
})
const storeSample = async (sample: StoredDrumSample) => { const db = await sampleDatabase(); await new Promise<void>((resolve, reject) => { const request = db.transaction('samples', 'readwrite').objectStore('samples').put(sample); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); db.close() }
const readStoredSamples = async (): Promise<StoredDrumSample[]> => { const db = await sampleDatabase(); const items = await new Promise<StoredDrumSample[]>((resolve, reject) => { const request = db.transaction('samples', 'readonly').objectStore('samples').getAll(); request.onsuccess = () => resolve(request.result as StoredDrumSample[]); request.onerror = () => reject(request.error); }); db.close(); return items }
const deleteStoredSample = async (id: string) => { const db = await sampleDatabase(); await new Promise<void>((resolve, reject) => { const request = db.transaction('samples', 'readwrite').objectStore('samples').delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); db.close() }
const drumNames = ['Kick', 'Clap', 'Closed Hat', 'Low Conga']
const colors = ['#b4f36a', '#b38cff', '#55c8d8', '#ffb36b']

export default function App() {
  const [view, setView] = useState('Playlist')
  const [bpm, setBpm] = useState(122)
  const [playing, setPlaying] = useState(false)
  const [master, setMaster] = useState(78)
  const [channelLevels, setChannelLevels] = useState([78, 66, 72, 55, 60])
  const [mutedChannels, setMutedChannels] = useState<boolean[]>([false, false, false, false, false, false])
  const [enabledEffects, setEnabledEffects] = useState<boolean[]>([false, false, false, false])
  const [selectedInstrument, setSelectedInstrument] = useState('Soft Keys')
  const [drumSamples, setDrumSamples] = useState<DrumSample[]>([])
  const [rowSampleIds, setRowSampleIds] = useState<string[]>(['', '', '', ''])
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleSearch, setSampleSearch] = useState('')
  const sampleInput = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [referencePreviewing, setReferencePreviewing] = useState(false)
  const [analysis, setAnalysis] = useState<string[]>([])
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null)
  const [analyzingReference, setAnalyzingReference] = useState(false)
  const [prompt, setPrompt] = useState('Warm, organic Afro House groove with deep bass and sunset atmosphere')
  const [generationElements, setGenerationElements] = useState<string[]>(['Drums','Bass','Melody'])
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null)
  const [clips, setClips] = useState<Clip[]>([
    { id: 1, name: 'Afro groove · drums', duration: 8, color: colors[0], lane: 0, startBar: 0 },
    { id: 2, name: 'Warm bass idea', duration: 8, color: colors[1], lane: 1, startBar: 2 },
    { id: 3, name: 'Reference · drop a song', duration: 16, color: colors[2], lane: 2, startBar: 0 },
    { id: 4, name: 'Melody · piano roll', duration: 8, color: colors[3], lane: 3, startBar: 0 },
  ])
  const [steps, setSteps] = useState<boolean[][]>([
    Array.from({ length: 16 }, (_, i) => i % 4 === 0),
    Array.from({ length: 16 }, (_, i) => i === 4 || i === 12),
    Array.from({ length: 16 }, (_, i) => i % 2 === 0),
    Array.from({ length: 16 }, (_, i) => i === 3 || i === 7 || i === 11 || i === 15),
  ])
  const [notes, setNotes] = useState<{id:number;step:number;pitch:number;duration:number;velocity:number}[]>([
    {id:1,step:0,pitch:5,duration:2,velocity:100},{id:2,step:3,pitch:3,duration:2,velocity:92},{id:3,step:6,pitch:4,duration:2,velocity:96},{id:4,step:10,pitch:2,duration:3,velocity:88},{id:5,step:13,pitch:4,duration:2,velocity:100},
  ])
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null)
  const selectedNote = notes.find(note => note.id === selectedNoteId)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const clipResizeRef = useRef<{id:number;pointerId:number;startX:number;startDuration:number;startBar:number;barWidth:number} | null>(null)

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [playheadStep, setPlayheadStep] = useState(0)
  const audioElement = useRef<HTMLAudioElement | null>(null)
  const audioImportRequestRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sampleLibraryLoaded = useRef(false)
  const autosaveReady = useRef(false)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('afrostudio-project-autosave-v1')
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const data = parsed as Record<string, unknown>
          const validSteps = Array.isArray(data.steps) && data.steps.length === 4 && data.steps.every(row => Array.isArray(row) && row.length === 16 && row.every(value => typeof value === 'boolean'))
          const validClips = Array.isArray(data.clips) && data.clips.every((clip: unknown) => {
            if (!clip || typeof clip !== 'object') return false
            const item = clip as Record<string, unknown>
            return typeof item.id === 'number' && typeof item.name === 'string' && typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 1 && item.duration <= 64 && typeof item.color === 'string' && typeof item.lane === 'number' && Number.isInteger(item.lane) && item.lane >= 0 && item.lane <= 3 && (item.startBar === undefined || (typeof item.startBar === 'number' && Number.isInteger(item.startBar) && item.startBar >= 0 && item.startBar <= 15))
          })
          const validNotes = Array.isArray(data.notes) && data.notes.every((note: unknown) => {
            if (!note || typeof note !== 'object') return false
            const item = note as Record<string, unknown>
            return typeof item.id === 'number' && typeof item.step === 'number' && item.step >= 0 && item.step < 16 && typeof item.pitch === 'number' && item.pitch >= 0 && item.pitch < 12 && (item.duration === undefined || (typeof item.duration === 'number' && item.duration >= 1 && item.duration <= 16)) && (item.velocity === undefined || (typeof item.velocity === 'number' && item.velocity >= 1 && item.velocity <= 127))
          })
          if (data.app === 'AfroStudio AI' && typeof data.bpm === 'number' && validSteps && validClips && validNotes) {
            setBpm(Math.max(40, Math.min(240, data.bpm)))
            setClips(data.clips as Clip[])
            setSteps(data.steps as boolean[][])
            setNotes((data.notes as {id:number;step:number;pitch:number;duration?:number;velocity?:number}[]).map(note => ({...note, duration: note.duration ?? 2, velocity: note.velocity ?? 100})))
            setReferenceName(typeof data.referenceName === 'string' ? data.referenceName : '')
            setMaster(typeof data.master === 'number' ? Math.max(0, Math.min(100, data.master)) : 78)
            setChannelLevels(Array.isArray(data.channelLevels) && data.channelLevels.length === 5 && data.channelLevels.every(v => typeof v === 'number') ? data.channelLevels.map(v => Math.max(0, Math.min(100, v as number))) : [78,66,72,55,60])
            setMutedChannels(Array.isArray(data.mutedChannels) && data.mutedChannels.length === 6 && data.mutedChannels.every(v => typeof v === 'boolean') ? data.mutedChannels as boolean[] : [false,false,false,false,false,false])
            setEnabledEffects(Array.isArray(data.enabledEffects) && data.enabledEffects.length === 4 && data.enabledEffects.every(v => typeof v === 'boolean') ? data.enabledEffects as boolean[] : [false,false,false,false])
            setSelectedInstrument(['Deep Kick','Warm Bass','Soft Keys','Air Texture'].includes(String(data.selectedInstrument)) ? String(data.selectedInstrument) : 'Soft Keys')
            if (typeof data.prompt === 'string') setPrompt(data.prompt)
            if (Array.isArray(data.generationElements) && data.generationElements.every(value => ['Drums','Bass','Melody','Chords','Atmosphere'].includes(String(value)))) setGenerationElements(data.generationElements as string[])
            if (Array.isArray(data.rowSampleIds) && data.rowSampleIds.length === 4 && data.rowSampleIds.every(id => typeof id === 'string')) setRowSampleIds(data.rowSampleIds as string[])
          }
        }
      }
    } catch {
      // Storage can be disabled or full; keep the starter project usable.
    }
    autosaveReady.current = true
  }, [])
  useEffect(() => {
    if (!autosaveReady.current || !sampleLibraryLoaded.current) return
    const timeout = window.setTimeout(() => {
      try {
        const rowSampleNames = rowSampleIds.map(id => drumSamples.find(sample => sample.id === id)?.name ?? '')
        const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationElements, enabledEffects, selectedInstrument, rowSampleNames, rowSampleIds }
        window.localStorage.setItem('afrostudio-project-autosave-v1', JSON.stringify(data))
      } catch {
        // Do not interrupt music work if browser storage is unavailable or full.
      }
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationElements, enabledEffects, selectedInstrument, rowSampleIds, drumSamples])
  useEffect(() => {
    let cancelled = false
    const restoreSamples = async () => {
      try {
        const stored = await readStoredSamples()
        if (cancelled || !stored.length) { sampleLibraryLoaded.current = true; return }
        const ctx = audioContextRef.current || new window.AudioContext()
        if (!audioContextRef.current) audioContextRef.current = ctx
        const restored: DrumSample[] = []
        for (const item of stored) {
          try {
            const buffer = await ctx.decodeAudioData(await item.blob.arrayBuffer())
            if (cancelled) return
            restored.push({ id: item.id, name: item.name, buffer, url: URL.createObjectURL(item.blob), duration: buffer.duration })
          } catch { /* Keep other valid samples if one file is no longer decodable. */ }
        }
        if (!cancelled && restored.length) setDrumSamples(old => [...restored, ...old.filter(sample => !restored.some(item => item.id === sample.id))])
        sampleLibraryLoaded.current = true
      } catch { sampleLibraryLoaded.current = true; if (!cancelled) notify('Local sample storage is unavailable in this browser. You can still import samples for this session.') }
    }
    void restoreSamples()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const url = audioUrl
    const audio = audioElement.current
    return () => {
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      if (url) URL.revokeObjectURL(url)
    }
  }, [audioUrl])
  useEffect(() => {
    if (playing && referencePreviewing) {
      audioElement.current?.pause()
      setReferencePreviewing(false)
    }
  }, [playing, referencePreviewing])
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = clipResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const deltaBars = Math.round((event.clientX - drag.startX) / drag.barWidth)
      const duration = Math.max(1, Math.min(16 - drag.startBar, drag.startDuration + deltaBars))
      setClips(old => old.map(clip => clip.id === drag.id ? { ...clip, duration } : clip))
    }
    const finish = (event: PointerEvent) => {
      if (clipResizeRef.current?.pointerId === event.pointerId) clipResizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [])
  const stepRef = useRef(0)
  const nextTickAtRef = useRef(0)
  const playbackStateRef = useRef({ clips, steps, notes, master, channelLevels, mutedChannels, enabledEffects, selectedInstrument, drumSamples, rowSampleIds })
  playbackStateRef.current = { clips, steps, notes, master, channelLevels, mutedChannels, enabledEffects, selectedInstrument, drumSamples, rowSampleIds }
  type Snapshot = { bpm:number; clips:Clip[]; steps:boolean[][]; notes:{id:number;step:number;pitch:number;duration:number;velocity:number}[]; master:number; channelLevels:number[]; enabledEffects:boolean[]; selectedInstrument:string }
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const applyingHistory = useRef(false)
  const lastSnapshot = useRef<Snapshot | null>(null)
  const projectRef = useRef<Snapshot>({ bpm, clips, steps, notes, master, channelLevels, enabledEffects, selectedInstrument })
  const currentSnapshot = () => ({ bpm, clips, steps, notes, master, channelLevels, enabledEffects, selectedInstrument })
  useEffect(() => {
    const current = currentSnapshot()
    projectRef.current = current
    if (!lastSnapshot.current) { lastSnapshot.current = current; return }
    if (applyingHistory.current) { lastSnapshot.current = current; applyingHistory.current = false; return }
    if (JSON.stringify(lastSnapshot.current) !== JSON.stringify(current)) {
      undoStack.current.push(lastSnapshot.current)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      lastSnapshot.current = current
    }
  }, [bpm, clips, steps, notes, master, channelLevels, enabledEffects, selectedInstrument])
  const applySnapshot = (snapshot: Snapshot) => {
    applyingHistory.current = true
    setBpm(snapshot.bpm); setClips(snapshot.clips); setSteps(snapshot.steps); setNotes(snapshot.notes); setMaster(snapshot.master); setChannelLevels(snapshot.channelLevels); setEnabledEffects(snapshot.enabledEffects ?? [false,false,false,false]); setSelectedInstrument(snapshot.selectedInstrument ?? 'Soft Keys')
    projectRef.current = snapshot; lastSnapshot.current = snapshot
  }
  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) { notify('Nothing to undo yet.'); return }
    redoStack.current.push(projectRef.current); applySnapshot(previous); notify('Undo')
  }
  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) { notify('Nothing to redo yet.'); return }
    undoStack.current.push(projectRef.current); applySnapshot(next); notify('Redo')
  }
  const generateAfroHouseIdea = () => {
    const selected = new Set(generationElements)
    const referenceTempo = audioUrl && detectedBpm ? detectedBpm : null
    const sampleRules = [/kick|bd|bass.?drum/i, /clap|snare|rim/i, /hat|shaker|cymbal|top.?perc/i, /conga|bongo|tom|hand.?perc/i]
    const matchedSamples = sampleRules.map(rule => drumSamples.find(sample => rule.test(sample.name))?.id ?? '')
    const matchedSampleCount = matchedSamples.filter(Boolean).length
    if (referenceTempo) setBpm(referenceTempo)
    if (selected.size === 0) { notify('Select at least one element to generate.'); return }
    if (selected.has('Drums')) {
      setSteps([
        Array.from({length:16},(_,i)=>i%4===0),
        Array.from({length:16},(_,i)=>i===4||i===12),
        Array.from({length:16},(_,i)=>i%2===0 || i===11 || i===15),
        Array.from({length:16},(_,i)=>[3,7,11,15].includes(i) && Math.random()>0.22),
      ])
      if (matchedSampleCount) setRowSampleIds(old => old.map((id, row) => matchedSamples[row] || id))
    }
    if (selected.has('Melody') || selected.has('Chords') || selected.has('Atmosphere')) {
      const scale = [0,2,3,5,7,8,10]
      const positions = selected.has('Atmosphere') ? [0,4,8,12] : [0,2,5,7,9,12,14,15]
      const generated: {id:number;step:number;pitch:number;duration:number;velocity:number}[] = []
      positions.forEach((step,i) => {
        const root = scale[Math.floor(Math.random()*scale.length)]
        if (selected.has('Chords')) [root,(root+3)%12,(root+7)%12].forEach((pitch,j)=>generated.push({id:Date.now()+i*10+j,step,pitch,duration:2,velocity:100}))
        else if (selected.has('Atmosphere')) [root,Math.min(11,root+4)].forEach((pitch,j)=>generated.push({id:Date.now()+i*10+j,step,pitch,duration:4,velocity:82}))
        else generated.push({id:Date.now()+i,step,pitch:root,duration:2,velocity:100})
      })
      setNotes(generated)
    }
    if (selected.has('Bass')) setClips(old=>old.some(c=>c.lane===1)?old: [...old,{id:Date.now()+20,name:'Generated bass groove',duration:8,color:colors[1],lane:1,startBar:0}])
    if (selected.has('Drums')) setClips(old=>old.some(c=>c.lane===0)?old:[...old,{id:Date.now()+21,name:'Generated Afro groove',duration:8,color:colors[0],lane:0,startBar:0}])
    if (selected.has('Melody') || selected.has('Chords')) setClips(old=>old.some(c=>c.lane===3)?old:[...old,{id:Date.now()+22,name:'Generated melody',duration:8,color:colors[3],lane:3,startBar:0}])
    setView('Playlist')
    const sampleNote = selected.has('Drums') && matchedSampleCount ? ' Matched ' + matchedSampleCount + ' imported drum samples by filename.' : ''
    notify((referenceTempo ? 'Created a local Afro House idea at the reference tempo (' + referenceTempo + ' BPM). Audio remixing and stem separation are not implemented yet.' : 'Created an original Afro House starting idea locally. Refine it in the Channel Rack and Piano Roll.') + sampleNote)
  }
  const duplicatePattern = () => {
    const selected = clips.find(clip => clip.id === selectedClipId)
    if (selected) {
      const startBar = selected.startBar ?? 0
      const nextBar = startBar + Math.max(1, Math.ceil(selected.duration))
      if (nextBar >= 16) { notify('There is no room to duplicate this clip later in the 16-bar timeline.'); return }
      const copy = { ...selected, id: Date.now(), name: selected.name + ' copy', startBar: nextBar, duration: Math.min(selected.duration, 16 - nextBar) }
      setClips(old => [...old, copy])
      setSelectedClipId(copy.id)
      notify('Selected clip duplicated at bar ' + (nextBar + 1) + '.')
      return
    }
    const copies = clips.filter(clip => clip.lane !== 2 && (clip.startBar ?? 0) < 8).map(clip => {
      const startBar = (clip.startBar ?? 0) + 8
      return { ...clip, id: Date.now() + clip.id, name: clip.name + ' copy', startBar, duration: Math.min(clip.duration, 16 - startBar) }
    }).filter(clip => clip.duration > 0)
    if (!copies.length) { notify('Select a clip to duplicate it later in the arrangement.'); return }
    setClips(old => [...old, ...copies])
    notify('Clips duplicated into the second half of the arrangement.')
  }
  const connectProcessedOutput = (ctx: AudioContext, input: AudioNode) => {
    const effects = playbackStateRef.current.enabledEffects
    let output: AudioNode = input
    if (effects[0]) {
      const highpass = ctx.createBiquadFilter()
      highpass.type = 'highpass'; highpass.frequency.value = 28; highpass.Q.value = 0.7
      output.connect(highpass); output = highpass
    }
    if (effects[1]) {
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 3
      compressor.attack.value = 0.008; compressor.release.value = 0.18
      output.connect(compressor); output = compressor
    }
    output.connect(ctx.destination)
    if (effects[2]) {
      const delay = ctx.createDelay(0.2), feedback = ctx.createGain(), wet = ctx.createGain()
      delay.delayTime.value = 0.045; feedback.gain.value = 0.22; wet.gain.value = 0.18
      output.connect(delay); delay.connect(wet).connect(ctx.destination); delay.connect(feedback).connect(delay)
      window.setTimeout(() => { delay.disconnect(); feedback.disconnect(); wet.disconnect() }, 2500)
    }
    if (effects[3]) {
      const delay = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain()
      delay.delayTime.value = 60 / bpm / 2; feedback.gain.value = 0.28; wet.gain.value = 0.22
      output.connect(delay); delay.connect(wet).connect(ctx.destination); delay.connect(feedback).connect(delay)
      window.setTimeout(() => { delay.disconnect(); feedback.disconnect(); wet.disconnect() }, 2500)
    }
  }
  const triggerDrum = (ctx: AudioContext, row: number) => {
    const { master, channelLevels, mutedChannels, drumSamples, rowSampleIds } = playbackStateRef.current
    const now = ctx.currentTime, out = ctx.createGain()
    const mixerIndex = row === 0 ? 1 : 2
    const channelLevel = channelLevels[row === 0 ? 0 : 1] ?? 100
    out.gain.value = mutedChannels[0] || mutedChannels[mixerIndex] ? 0 : Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, channelLevel / 100)) * 0.8; connectProcessedOutput(ctx, out)
    const assignedSample = drumSamples.find(sample => sample.id === rowSampleIds[row])
    if (assignedSample) {
      const source = ctx.createBufferSource()
      source.buffer = assignedSample.buffer
      source.connect(out)
      source.start(now)
      return
    }
    if (row === 0 || row === 3) {
      const osc = ctx.createOscillator(), env = ctx.createGain()
      osc.type = row === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(row === 0 ? 145 : 230, now)
      osc.frequency.exponentialRampToValueAtTime(row === 0 ? 48 : 115, now + (row === 0 ? 0.12 : 0.08))
      env.gain.setValueAtTime(0.0001, now); env.gain.exponentialRampToValueAtTime(row === 0 ? 0.85 : 0.35, now + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, now + (row === 0 ? 0.22 : 0.12))
      osc.connect(env).connect(out); osc.start(now); osc.stop(now + (row === 0 ? 0.23 : 0.13))
    } else {
      const length = Math.floor(ctx.sampleRate * (row === 1 ? 0.16 : 0.055))
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0)
      for (let i=0;i<length;i++) data[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain()
      noise.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = row === 1 ? 1400 : 6500
      env.gain.setValueAtTime(0.0001, now); env.gain.exponentialRampToValueAtTime(row === 1 ? 0.5 : 0.28, now + 0.003); env.gain.exponentialRampToValueAtTime(0.0001, now + (row === 1 ? 0.15 : 0.05))
      noise.connect(filter).connect(env).connect(out); noise.start(now); noise.stop(now + (row === 1 ? 0.16 : 0.06))
    }
  }
  const triggerNote = (ctx: AudioContext, pitch: number, level = 1, channelIndex = 3, duration = 0.22) => {
    const { master, channelLevels, mutedChannels } = playbackStateRef.current
    const now = ctx.currentTime, osc = ctx.createOscillator(), env = ctx.createGain(), filter = ctx.createBiquadFilter()
    const instrument = playbackStateRef.current.selectedInstrument
    const presets: Record<string, {wave: OscillatorType; cutoff: number; gain: number; octave: number; attack: number; release: number}> = {
      'Deep Kick': {wave:'sine', cutoff:260, gain:0.34, octave:-12, attack:0.006, release:0.16},
      'Warm Bass': {wave:'sawtooth', cutoff:520, gain:0.22, octave:-12, attack:0.012, release:0.1},
      'Soft Keys': {wave:'triangle', cutoff:2400, gain:0.14, octave:0, attack:0.025, release:0.18},
      'Air Texture': {wave:'sine', cutoff:5200, gain:0.12, octave:12, attack:0.08, release:0.32},
    }
    const preset = presets[instrument] ?? presets['Soft Keys']
    osc.type = preset.wave; osc.frequency.value = 440 * Math.pow(2, ((60 + pitch + preset.octave) - 69) / 12)
    filter.type = 'lowpass'; filter.frequency.value = preset.cutoff
    const channelLevel = channelLevels[channelIndex] ?? 100
    const mixerIndex = channelIndex === 2 ? 3 : 4
    const muted = mutedChannels[0] || mutedChannels[mixerIndex]
    const noteDuration = Math.max(0.04, Math.min(2, duration))
    env.gain.setValueAtTime(0.0001, now); env.gain.exponentialRampToValueAtTime((muted ? 0 : preset.gain * master / 100 * Math.max(0, Math.min(1, channelLevel / 100)) * level), now + preset.attack); env.gain.setTargetAtTime(0.0001, now + Math.max(0.03, noteDuration - preset.release), Math.max(0.025, preset.release / 4))
    osc.connect(filter).connect(env); connectProcessedOutput(ctx, env); osc.start(now); osc.stop(now + noteDuration)
  }
  const clipActiveAt = (lane: number, bar: number) => playbackStateRef.current.clips.some(c => c.lane === lane && bar >= (c.startBar ?? 0) && bar < (c.startBar ?? 0) + Math.max(1, Math.ceil(c.duration)))
  useEffect(() => {
    if (!playing) {
      nextTickAtRef.current = 0
      return
    }
    const ctx = audioContextRef.current || new window.AudioContext()
    if (!audioContextRef.current) {
      audioContextRef.current = ctx
      setAudioContext(ctx)
    }
    void ctx.resume()
    const stepMs = 60000 / bpm / 4
    if (nextTickAtRef.current === 0) nextTickAtRef.current = performance.now()
    let timer = 0
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const now = performance.now()
      if (now + 1 < nextTickAtRef.current) {
        timer = window.setTimeout(tick, Math.max(1, nextTickAtRef.current - now))
        return
      }
      const position = stepRef.current
      const bar = Math.floor(position / 16)
      const step = position % 16
      const current = playbackStateRef.current
      // Follow the real arrangement length instead of always stopping after eight bars.
      // The empty reference placeholder is only a drop target, not a 16-bar song.
      const lastClipBar = current.clips
        .filter(clip => !(clip.lane === 2 && clip.name === 'Reference · drop a song'))
        .reduce((end, clip) => Math.max(end, (clip.startBar ?? 0) + Math.max(1, clip.duration)), 8)
      const arrangementBars = Math.max(8, Math.min(16, Math.ceil(lastClipBar)))
      const arrangementEndStep = arrangementBars * 16
      if (clipActiveAt(0, bar)) current.steps.forEach((row, rowIndex) => { if (row[step]) triggerDrum(ctx, rowIndex) })
      if (clipActiveAt(1, bar) && [0, 6, 8, 14].includes(step)) triggerNote(ctx, step % 8 === 0 ? 0 : 3, 0.72, 2)
      if (clipActiveAt(3, bar)) current.notes.filter(note => note.step === step).forEach(note => triggerNote(ctx, note.pitch, note.velocity / 127, 3, note.duration * 60 / bpm / 4))
      const reference = current.clips.find(c => c.lane === 2 && bar >= (c.startBar ?? 0) && bar < (c.startBar ?? 0) + Math.max(1, Math.ceil(c.duration)))
      const audio = audioElement.current
      if (audio && reference) {
        const expectedTime = Math.max(0, (bar - (reference.startBar ?? 0)) * 4 * 60 / bpm + step * 60 / bpm / 4)
        if (audio.paused) {
          audio.currentTime = Math.min(expectedTime, Number.isFinite(audio.duration) ? audio.duration : expectedTime)
          void audio.play().catch(() => notify('Browser blocked reference playback. Press Play again to allow audio.'))
        } else if (Math.abs(audio.currentTime - expectedTime) > 0.3) {
          audio.currentTime = Math.min(expectedTime, Number.isFinite(audio.duration) ? audio.duration : expectedTime)
        }
      } else if (audio && !audio.paused) audio.pause()
      setPlayheadStep(position)
      if (position >= arrangementEndStep - 1) {
        stepRef.current = 0
        setPlayheadStep(0)
        setPlaying(false)
        nextTickAtRef.current = 0
        if (audio && !audio.paused) audio.pause()
        return
      }
      stepRef.current = position + 1
      nextTickAtRef.current += stepMs
      // If the browser tab was suspended, skip missed ticks instead of rapidly firing a burst.
      if (nextTickAtRef.current < now - stepMs) nextTickAtRef.current = now + stepMs
      timer = window.setTimeout(tick, Math.max(1, nextTickAtRef.current - performance.now()))
    }
    timer = window.setTimeout(tick, Math.max(0, nextTickAtRef.current - performance.now()))
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [playing, bpm])
  useEffect(() => {
    const audio = audioElement.current
    if (!audio) return
    audio.volume = mutedChannels[0] || mutedChannels[5] ? 0 : Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, (channelLevels[4] ?? 100) / 100))
    if (!playing) audio.pause()
  }, [playing, audioUrl, master, channelLevels, mutedChannels])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); return }
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); duplicatePattern(); return }
      if (!typing && view === 'Playlist' && selectedClipId !== null && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); setClips(old => old.filter(clip => clip.id !== selectedClipId)); setSelectedClipId(null); notify('Selected clip deleted.'); return }
      if (!typing && view === 'Piano Roll' && selectedNoteId !== null && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); setNotes(old => old.filter(note => note.id !== selectedNoteId)); setSelectedNoteId(null); return }
      if (event.code === 'Space' && !typing) { event.preventDefault(); setPlaying(v => !v); return }
      if (!typing && event.key === 'F5') { event.preventDefault(); setView('Playlist') }
      if (!typing && event.key === 'F6') { event.preventDefault(); setView('Channel Rack') }
      if (!typing && event.key === 'F7') { event.preventDefault(); setView('Piano Roll') }
      if (!typing && event.key === 'F9') { event.preventDefault(); setView('Mixer') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const notify = (s: string) => { setToast(s); window.setTimeout(() => setToast(''), 2600) }
  const importDrumSamples = async (files: FileList | File[]): Promise<DrumSample[]> => {
    const chosen = Array.from(files).filter(file => file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i.test(file.name))
    if (!chosen.length) { notify('Choose audio samples such as WAV, MP3, OGG or FLAC.'); return [] }
    setLoadingSamples(true)
    const loaded: DrumSample[] = []
    try {
      const ctx = audioContextRef.current || audioContext || new window.AudioContext()
      if (!audioContextRef.current) audioContextRef.current = ctx
      if (!audioContext) setAudioContext(ctx)
      if (ctx.state === 'suspended') await ctx.resume()
      for (const file of chosen) {
        if (file.size > 40 * 1024 * 1024) { notify(file.name + ' skipped: sample is over 40 MB.'); continue }
        try {
          const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
          const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)
          const url = URL.createObjectURL(file)
          loaded.push({ id, name: file.name, buffer, url, duration: buffer.duration })
          try { await storeSample({ id, name: file.name, blob: file.slice(0, file.size, file.type) }) } catch { notify('Loaded ' + file.name + ', but browser storage could not save it for next time.') }
        } catch { notify('Could not decode ' + file.name + ' in this browser.') }
      }
      if (loaded.length) { setDrumSamples(old => [...old, ...loaded]); notify('Loaded ' + loaded.length + ' sample' + (loaded.length === 1 ? '' : 's') + ' into the local Sampler library.') }
    } catch { notify('Audio samples could not be loaded in this browser.') }
    finally { setLoadingSamples(false) }
    return loaded
  }
  const previewDrumSample = async (sample: DrumSample) => {
    try {
      const ctx = audioContextRef.current || audioContext || new window.AudioContext()
      if (!audioContextRef.current) audioContextRef.current = ctx
      if (!audioContext) setAudioContext(ctx)
      if (ctx.state === 'suspended') await ctx.resume()
      const source = ctx.createBufferSource(), gain = ctx.createGain()
      source.buffer = sample.buffer
      gain.gain.value = Math.max(0, Math.min(1, master / 100))
      source.connect(gain).connect(ctx.destination)
      source.start()
    } catch { notify('Sample preview could not start.') }
  }
  const assignSampleToRow = (sampleId: string, row: number) => {
    setRowSampleIds(old => old.map((id, index) => index === row ? sampleId : id))
    const sample = drumSamples.find(item => item.id === sampleId)
    notify(sample ? sample.name + ' assigned to ' + drumNames[row] + '.' : 'Built-in synthesized ' + drumNames[row] + ' restored.')
  }
  const removeDrumSample = (sample: DrumSample) => {
    setDrumSamples(old => old.filter(item => item.id !== sample.id))
    setRowSampleIds(old => old.map(id => id === sample.id ? '' : id))
    URL.revokeObjectURL(sample.url)
    void deleteStoredSample(sample.id).catch(() => notify('Removed from this session, but browser storage could not be updated.'))
    notify('Removed ' + sample.name + ' from your local library.')
  }
  const preview = async (hz = 110) => {
    try {
      const Ctx = window.AudioContext
      const ctx = audioContextRef.current || audioContext || new Ctx()
      if (!audioContextRef.current) audioContextRef.current = ctx
      if (!audioContext) setAudioContext(ctx)
      if (ctx.state === 'suspended') await ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.31)
    } catch { notify('Audio preview could not start in this browser.') }
  }
  const analyzeReferenceLocally = async (file: File, requestId: number) => {
    if (file.size > 80 * 1024 * 1024) {
      if (requestId === audioImportRequestRef.current) setAnalysis(old => [...old, 'Local BPM analysis skipped: file is over 80 MB.'])
      return
    }
    setAnalyzingReference(true)
    try {
      const ctx = audioContextRef.current || new window.AudioContext()
      if (!audioContextRef.current) audioContextRef.current = ctx
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
      if (requestId !== audioImportRequestRef.current) return
      // Build a lightweight 100 Hz mono energy envelope from at most the first 60 seconds.
      // This is a heuristic tempo estimate, not a trained AI model.
      const sourceRate = decoded.sampleRate
      const source = decoded.getChannelData(0)
      const seconds = Math.min(60, decoded.duration)
      const frameCount = Math.floor(seconds * 100)
      const envelope = new Float32Array(frameCount)
      const framesPerBucket = Math.max(1, Math.floor(sourceRate / 100))
      for (let i = 0; i < frameCount; i++) {
        const start = i * framesPerBucket
        const end = Math.min(source.length, start + framesPerBucket)
        let energy = 0
        for (let j = start; j < end; j += 4) energy += Math.abs(source[j])
        envelope[i] = energy / Math.max(1, Math.ceil((end - start) / 4))
      }
      const onset = new Float32Array(frameCount)
      let mean = 0
      for (let i = 1; i < frameCount; i++) {
        onset[i] = Math.max(0, envelope[i] - envelope[i - 1])
        mean += onset[i]
      }
      mean /= Math.max(1, frameCount - 1)
      if (mean < 0.00001 || frameCount < 800) {
        setAnalysis(old => [...old, 'Local BPM estimate unavailable: audio has too little clear rhythmic information.'])
        return
      }
      let bestTempo = 0
      let bestScore = -Infinity
      for (let tempo = 70; tempo <= 150; tempo++) {
        const lag = Math.round(6000 / tempo)
        let score = 0
        for (let i = lag; i < frameCount; i++) score += onset[i] * onset[i - lag]
        if (score > bestScore) { bestScore = score; bestTempo = tempo }
      }
      if (requestId !== audioImportRequestRef.current) return
      setDetectedBpm(bestTempo || null)
      setAnalysis(old => [...old, bestTempo ? 'Experimental local BPM estimate: about ' + bestTempo + ' BPM (check by ear).' : 'Local BPM estimate unavailable.'])
    } catch {
      if (requestId === audioImportRequestRef.current) setAnalysis(old => [...old, 'Local analysis could not decode this format in the browser.'])
    } finally {
      if (requestId === audioImportRequestRef.current) setAnalyzingReference(false)
    }
  }
  const importFile = (file?: File, startBar = 0) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|ogg|m4a|aiff?)$/i.test(file.name)) { notify('Choose an audio file such as WAV, MP3, FLAC or M4A.'); return }
    const requestId = ++audioImportRequestRef.current
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    const discardStaleImport = () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
    audio.onloadedmetadata = () => {
      if (requestId !== audioImportRequestRef.current) { discardStaleImport(); return }
      const duration = Number.isFinite(audio.duration) ? audio.duration : 30
      setReferenceName(file.name)
      setAudioUrl(url); audioElement.current = audio
      audio.onended = () => setReferencePreviewing(false)
      const barDuration = 4 * 60 / bpm; const clipStart = Math.max(0, Math.min(15, Math.floor(startBar))); const clipBars = Math.max(1, Math.min(16 - clipStart, Math.ceil(duration / barDuration))); setClips(old => [...old.filter(c => !(c.lane === 2 && c.name === 'Reference · drop a song')), { id: Date.now(), name: file.name, duration: clipBars, color: colors[2], lane: 2, startBar: clipStart }])
      setDetectedBpm(null)
      setAnalysis(['Audio loaded · ' + Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0'), 'Running lightweight local tempo analysis. Key detection, stem separation and AI audio remixing are not available yet.'])
      void analyzeReferenceLocally(file, requestId)
      notify('Reference imported. Local tempo analysis started.')
    }
    audio.onerror = () => {
      if (requestId !== audioImportRequestRef.current) { discardStaleImport(); return }
      setReferenceName(file.name); setAnalysis(['File selected: ' + file.name, 'Could not read duration in the browser.']); setAudioUrl(url); audioElement.current = audio
      audio.onended = () => setReferencePreviewing(false)
    }
    audio.load()
  }
  const clearReference = () => {
    audioImportRequestRef.current += 1
    audioElement.current?.pause()
    audioElement.current = null
    setReferencePreviewing(false)
    setReferenceName('')
    setAnalysis([])
    setDetectedBpm(null)
    setAnalyzingReference(false)
    setAudioUrl('')
    setClips(old => old.filter(clip => clip.lane !== 2))
    notify('Reference audio removed.')
  }
  const pianoDrag = useRef<{id:number;pointerId:number;startX:number;startY:number;step:number;pitch:number;duration:number;resizing:boolean} | null>(null)
  const handlePianoPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const noteElement = target.closest<HTMLButtonElement>('.midi-note')
    if (!noteElement) return
    const id = Number(noteElement.dataset.noteId)
    const note = notes.find(item => item.id === id)
    if (!note) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = noteElement.getBoundingClientRect()
    pianoDrag.current = { id, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, step:note.step, pitch:note.pitch, duration:note.duration, resizing:event.clientX >= rect.right - 9 }
    setSelectedNoteId(id)
  }
  const handlePianoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pianoDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const stepDelta = Math.round((event.clientX - drag.startX) / (rect.width / 16))
    if (drag.resizing) {
      const duration = Math.max(1, Math.min(16 - drag.step, drag.duration + stepDelta))
      setNotes(old => old.map(note => note.id === drag.id ? {...note, duration} : note))
      return
    }
    const rowDelta = Math.round((event.clientY - drag.startY) / 28)
    const step = Math.max(0, Math.min(15, drag.step + stepDelta))
    const pitch = Math.max(0, Math.min(11, drag.pitch - rowDelta))
    setNotes(old => old.map(note => note.id === drag.id ? {...note, step, pitch, duration:Math.min(note.duration,16-step)} : note))
  }
  const handlePianoPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pianoDrag.current?.pointerId === event.pointerId) pianoDrag.current = null
  }
  const saveProject = () => {
    const rowSampleNames = rowSampleIds.map(id => drumSamples.find(sample => sample.id === id)?.name ?? '')
    const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationElements, enabledEffects, selectedInstrument, rowSampleNames, rowSampleIds }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'afrostudio-project.json'; a.click(); URL.revokeObjectURL(url)
    notify('Project data exported.')
  }
  const loadProject = async (file?: File) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid project')
      const data = parsed as Record<string, unknown>
      if (data.app !== 'AfroStudio AI' || typeof data.bpm !== 'number' || !Array.isArray(data.clips) || !Array.isArray(data.steps) || !Array.isArray(data.notes)) {
        throw new Error('This is not a supported AfroStudio project file.')
      }
      const validSteps = data.steps.length === 4 && data.steps.every(row => Array.isArray(row) && row.length === 16 && row.every(value => typeof value === 'boolean'))
      const validClips = data.clips.every((clip: unknown) => {
        if (!clip || typeof clip !== 'object') return false
        const item = clip as Record<string, unknown>
        return typeof item.id === 'number' && typeof item.name === 'string' && typeof item.duration === 'number' &&
          typeof item.color === 'string' && typeof item.lane === 'number' && Number.isInteger(item.lane) && item.lane >= 0 && item.lane <= 3 && typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 1 && item.duration <= 64 && (item.startBar === undefined || (typeof item.startBar === 'number' && Number.isInteger(item.startBar) && item.startBar >= 0 && item.startBar <= 15))
      })
      const validNotes = data.notes.every((note: unknown) => {
        if (!note || typeof note !== 'object') return false
        const item = note as Record<string, unknown>
        return typeof item.id === 'number' && typeof item.step === 'number' && item.step >= 0 && item.step < 16 &&
          typeof item.pitch === 'number' && item.pitch >= 0 && item.pitch < 12 && (item.duration === undefined || (typeof item.duration === 'number' && item.duration >= 1 && item.duration <= 16)) && (item.velocity === undefined || (typeof item.velocity === 'number' && item.velocity >= 1 && item.velocity <= 127))
      })
      if (!validSteps || !validClips || !validNotes) throw new Error('Project data is incomplete or damaged.')
      setPlaying(false)
      stepRef.current = 0
      nextTickAtRef.current = 0
      audioElement.current?.pause()
      setReferencePreviewing(false)
      audioElement.current = null
      setAudioUrl('')
      setReferenceName(typeof data.referenceName === 'string' ? data.referenceName : '')
      setBpm(Math.max(40, Math.min(240, data.bpm)))
      setClips(data.clips as Clip[])
      setSteps(data.steps as boolean[][])
      setNotes((data.notes as {id:number;step:number;pitch:number;duration?:number;velocity?:number}[]).map(note => ({...note,duration:note.duration ?? 2,velocity:note.velocity ?? 100})))
      setSelectedNoteId(null)
      setSelectedInstrument(['Deep Kick','Warm Bass','Soft Keys','Air Texture'].includes(String(data.selectedInstrument)) ? String(data.selectedInstrument) : 'Soft Keys')
      setMutedChannels(Array.isArray(data.mutedChannels) && data.mutedChannels.length === 6 && data.mutedChannels.every(v => typeof v === 'boolean') ? data.mutedChannels as boolean[] : [false,false,false,false,false,false])
      setEnabledEffects(Array.isArray(data.enabledEffects) && data.enabledEffects.length === 4 && data.enabledEffects.every(v => typeof v === 'boolean') ? data.enabledEffects as boolean[] : [false,false,false,false])
      setMaster(typeof data.master === 'number' ? Math.max(0, Math.min(100, data.master)) : 78)
      setChannelLevels(Array.isArray(data.channelLevels) && data.channelLevels.length === 5 && data.channelLevels.every(v => typeof v === 'number') ? data.channelLevels.map(v => Math.max(0, Math.min(100, v as number))) : [78, 66, 72, 55, 60])
      if (typeof data.prompt === 'string') setPrompt(data.prompt)
      if (Array.isArray(data.generationElements) && data.generationElements.every(value => ['Drums','Bass','Melody','Chords','Atmosphere'].includes(String(value)))) setGenerationElements(data.generationElements as string[])
      if (Array.isArray(data.rowSampleNames) && data.rowSampleNames.length === 4 && data.rowSampleNames.every(name => typeof name === 'string')) {
        const names = data.rowSampleNames as string[]
        const savedIds = Array.isArray(data.rowSampleIds) && data.rowSampleIds.length === 4 && data.rowSampleIds.every(id => typeof id === 'string') ? data.rowSampleIds as string[] : []
        const restoredIds = names.map((name, row) => {
          const savedId = savedIds[row]
          if (savedId && drumSamples.some(sample => sample.id === savedId)) return savedId
          return name ? drumSamples.find(sample => sample.name === name)?.id ?? '' : ''
        })
        setRowSampleIds(restoredIds)
        if (names.some((name, row) => name && !restoredIds[row])) notify('Project loaded. Import missing drum samples to restore all assigned sounds.')
      } else setRowSampleIds(['', '', '', ''])
      stepRef.current = 0
      setPlayheadStep(0)
      notify('Project loaded. Re-import its reference audio if needed.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open this project file.')
    }
  }
  const filteredDrumSamples = drumSamples.filter(sample => sample.name.toLowerCase().includes(sampleSearch.trim().toLowerCase()))
  const nav = [{ name: 'Playlist', Icon: Layers3 }, { name: 'Piano Roll', Icon: Music2 }, { name: 'Channel Rack', Icon: Drum }, { name: 'Sampler', Icon: FileAudio }, { name: 'Mixer', Icon: SlidersHorizontal }]

  return <div className="app-shell" onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files?.[0]) }}>
    {dragging && <div className="drop-overlay"><div className="drop-message"><Upload size={34}/><h2>Drop audio into AfroStudio</h2><p>It will be added to your Playlist.</p></div></div>}
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioWaveform size={23}/></div><div><div className="brand-name">AfroStudio <span>AI</span></div><div className="brand-sub">MAKE YOUR OWN RHYTHM</div></div></div>
      <nav className="top-menu"><button className="menu-link selected" onClick={() => setView('Playlist')}>Studio</button><button className="menu-link" onClick={() => setView('Reference Track')}>AI Lab <i className="new-dot"/></button><button className="menu-link" onClick={() => setView('Sampler')}>Sound Library</button></nav>
      <div className="top-actions"><div className="project-name"><i className="status-dot"/> Untitled Project <ChevronDown size={14}/></div><button className="icon-button" onClick={() => notify('Audio uses your browser output. Master volume controls generated sounds.')}><Settings2 size={17}/></button><button className="secondary-button" onClick={() => projectInput.current?.click()}><FolderOpen size={15}/> Open project</button><input ref={projectInput} type="file" accept="application/json,.json" hidden onChange={e=>{void loadProject(e.target.files?.[0]);e.currentTarget.value=''}}/><button className="save-button" onClick={saveProject}><Save size={15}/> Save project</button></div>
    </header>
    <div className="transport">
      <div className="transport-left"><button className="transport-icon" onClick={() => {setPlaying(false);stepRef.current=0;nextTickAtRef.current=0;setPlayheadStep(0);if(audioElement.current){audioElement.current.pause();audioElement.current.currentTime=0}notify('Playback stopped.') }} title="Stop"><Square size={13} fill="currentColor"/></button><button className="play-button" onClick={() => setPlaying(v => !v)} title="Play or pause">{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button className="transport-icon" onClick={() => {stepRef.current=0;nextTickAtRef.current=0;setPlayheadStep(0);if(audioElement.current)audioElement.current.currentTime=0;notify('Returned to start.')}}><span>↶</span></button><div className="transport-divider"/><div className="bpm-control"><span>BPM</span><input aria-label="Tempo BPM" type="number" min="40" max="240" value={bpm} onChange={e=>setBpm(Math.max(40,Math.min(240,Number(e.target.value)||122)))}/><div className="bpm-nudge"><button onClick={()=>setBpm(v=>Math.min(240,v+1))}>⌃</button><button onClick={()=>setBpm(v=>Math.max(40,v-1))}>⌄</button></div></div><div className="key-pill"><span>KEY</span><strong>A min</strong><ChevronDown size={12}/></div><div className="time-readout">{(()=>{const seconds=Math.floor(playheadStep*(60/bpm/4));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')})()}</div></div>
      <div className="transport-center"><span className="status-dot green"/> Audio engine <span className="status-label">{playing ? "Playing arrangement" : "Ready"}</span></div>
      <div className="transport-right"><HeadphonesFallback/><span>MASTER</span><input aria-label="Master volume" type="range" min="0" max="100" value={master} onChange={e=>setMaster(Number(e.target.value))}/><span className="volume-value">{master}%</span></div>
    </div>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-label">WORKSPACE</div>{nav.map(({name,Icon})=><button key={name} className={view===name?'side-nav active':'side-nav'} onClick={()=>setView(name)}><Icon size={17}/><span>{name}</span>{name==='Playlist'&&<small>F5</small>}</button>)}
        <div className="sidebar-label plugins-label">TOOLS & AI</div><button className={view==='Reference Track'?'side-nav active':'side-nav'} onClick={()=>setView('Reference Track')}><WandSparkles size={17}/><span>Reference Track</span><b className="beta-tag">AI</b></button><button className={view==='Instruments'?'side-nav active':'side-nav'} onClick={()=>setView('Instruments')}><Disc3 size={17}/><span>Instruments</span></button><button className={view==='Effects'?'side-nav active':'side-nav'} onClick={()=>setView('Effects')}><Waves size={17}/><span>Effects</span></button>
        <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17}/></div><strong>Your sound. Your rules.</strong><p>Local-first tools. No mandatory subscriptions.</p><button onClick={()=>setView('Reference Track')}>Explore AI tools <span>↗</span></button></div><button className="help-link" onClick={()=>notify('Shortcuts: Space Play/Stop · Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+S Save · Ctrl+B Duplicate · Delete selected Piano Roll note · F5 Playlist · F6 Rack · F7 Piano Roll · F9 Mixer')}>? &nbsp; Help & shortcuts</button><div className="version">AFROSTUDIO AI <span>v0.1.0 · EARLY BUILD</span></div></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><i/> YOUR CREATIVE SPACE</div><h1>{view==='Playlist'?'Arrangement':view}</h1><p>{view==='Reference Track'?'Discover the DNA of a track. Create something that feels like you.':'Build your next Afro House record, one layer at a time.'}</p></div><div className="heading-actions"><button className="small-icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Undo2 size={15}/></button><button className="small-icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Redo2 size={15}/></button><button className="secondary-button" onClick={()=>fileInput.current?.click()}><Upload size={15}/> Import audio</button><button className="secondary-button" onClick={async()=>{notify("Rendering Playlist arrangement to WAV…");try{let referenceAudio:AudioBuffer|undefined;if(audioUrl){const response=await fetch(audioUrl);const bytes=await response.arrayBuffer();const decodeContext=new AudioContext();try{referenceAudio=await decodeContext.decodeAudioData(bytes)}finally{await decodeContext.close()}}await exportArrangementWav({bpm,master,steps,notes,clips,channelLevels,referenceAudio,drumSamples:drumSamples.map(sample=>sample.buffer),drumSampleIds:drumSamples.map(sample=>sample.id),rowSampleIds,bars:Math.min(16,Math.max(8,...clips.filter(clip=>clip.lane!==2||Boolean(audioUrl)).map(clip=>Math.ceil((clip.startBar??0)+clip.duration)))),selectedInstrument,mutedChannels});notify("Arrangement WAV exported successfully.")}catch{notify("WAV export failed in this browser.")}}}><Download size={15}/> Export WAV</button><input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg" hidden onChange={e=>importFile(e.target.files?.[0])}/><button className="primary-button" onClick={()=>setView('Reference Track')}><Sparkles size={15}/> AI Assistant</button></div></div>
        {view==='Playlist'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Layers3 size={16}/></div><div><h2>Playlist</h2><p>Arrange patterns, vocals and audio on the timeline</p></div></div><div className="panel-tools"><span className="tiny-status"><i className="status-dot green"/> AUTO-SAVE READY</span><button className="small-icon-button" title="Add pattern clip" onClick={()=>{const id=Date.now();setClips(old=>[...old,{id,name:'New pattern',duration:4,color:colors[0],lane:0,startBar:0}]);setSelectedClipId(id);notify('New pattern clip added.')}}><Plus size={16}/></button><button className="small-icon-button" title="Duplicate selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={duplicatePattern}><Copy size={15}/></button><button className="small-icon-button" title="Delete selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={()=>{setClips(old=>old.filter(c=>c.id!==selectedClipId));setSelectedClipId(null);notify('Clip deleted.')}}><Trash2 size={15}/></button><button className="small-icon-button" title="Import audio" onClick={()=>fileInput.current?.click()}><FolderOpen size={16}/></button></div></div><div className="timeline-wrap"><div className="timeline-ruler"><div className="track-label-spacer">TRACKS</div><div className="ruler-beats">{Array.from({length:17},(_,i)=><div key={i} className="ruler-number">{i+1}<span/></div>)}</div></div>{['Drums & Percussion','Bass & Groove','Reference / Audio','Melody & Atmosphere'].map((lane,i)=><div className="timeline-row" key={lane}><div className="track-label"><i className="track-color" style={{background:colors[i]}}/><span>{lane}</span><button onClick={()=>notify(lane+' track options')}>···</button></div><div className="timeline-grid" title="Click an empty bar to seek" onClick={e=>{if((e.target as HTMLElement).closest(".audio-clip"))return;const rect=e.currentTarget.getBoundingClientRect();const bar=Math.max(0,Math.min(15,Math.floor(((e.clientX-rect.left)/rect.width)*16)));const nextStep=bar*16;stepRef.current=nextStep;setPlayheadStep(nextStep);if(!playing){nextTickAtRef.current=0;if(audioElement.current)audioElement.current.currentTime=bar*4*60/bpm}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const bar=Math.max(0,Math.min(15,Math.floor(((e.clientX-rect.left)/rect.width)*16)));const file=e.dataTransfer.files?.[0];if(file){importFile(file,bar);return}const id=Number(e.dataTransfer.getData('text/plain'));if(!id)return;setClips(old=>old.map(c=>c.id===id?{...c,lane:i,startBar:bar,duration:Math.max(1,Math.min(c.duration,16-bar))}:c));setSelectedClipId(id);notify('Clip moved to bar '+(bar+1)+'.')}}>{Array.from({length:16},(_,j)=><div key={j} className="grid-beat"/>)}<div className="playhead-line" style={{left:((playheadStep/256)*100)+'%'}} aria-hidden="true"/>{clips.filter(c=>c.lane===i).map(c=><button key={c.id} draggable className="audio-clip" title="Drag to move this clip between bars and tracks" onDragStart={e=>{if(clipResizeRef.current?.id===c.id){e.preventDefault();return}e.dataTransfer.setData('text/plain',String(c.id));e.dataTransfer.effectAllowed='move'}} style={{boxShadow:selectedClipId===c.id?'0 0 0 2px #ffffff':'none',left:((c.startBar??(c.id===3?0:(c.id%3))) * 6.25)+'%',width:Math.min(100-((c.startBar??0)*6.25),Math.max(6.25,Math.ceil(c.duration)*6.25))+'%',background:c.color+'20',borderColor:c.color+'70'}} onClick={()=>{setSelectedClipId(c.id);notify('Selected clip: '+c.name)}}><span className="clip-wave" style={{color:c.color}}>{Array.from({length:38},(_,k)=><i key={k} style={{height:(18+((k*17+c.id*11)%72))+'%'}}/>)}</span><span className="clip-name">{c.name}</span><span className="clip-resize-handle" role="slider" aria-label={'Resize '+c.name} title="Drag to resize clip by whole bars" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const grid=e.currentTarget.closest('.timeline-grid');if(!grid)return;const startBar=c.startBar??0;clipResizeRef.current={id:c.id,pointerId:e.pointerId,startX:e.clientX,startDuration:Math.min(c.duration,16-startBar),startBar,barWidth:grid.getBoundingClientRect().width/16};setSelectedClipId(c.id)}} onClick={e=>e.stopPropagation()} /></button>)}</div></div>)}</div><div className="timeline-footer"><span><i className="status-dot green"/> 4 tracks</span><span>Snap: Bar <ChevronDown size={12}/></span><span>Zoom <button onClick={()=>notify('Zoom out')}>−</button> <button onClick={()=>notify('Zoom in')}>+</button></span><span className="footer-hint">Space: Play · Ctrl+Z: Undo · Ctrl+S: Save</span></div></section>}
        {view==='Sampler'&&<section className="panel" onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);if(e.dataTransfer.files.length)void importDrumSamples(e.dataTransfer.files)}}><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><FileAudio size={16}/></div><div><h2>Sampler & Sound Library</h2><p>Import or drag samples here · saved locally on this PC</p></div></div><button className="primary-button compact" onClick={()=>sampleInput.current?.click()} disabled={loadingSamples}><Upload size={14}/>{loadingSamples?'Loading…':'Import samples'}</button><input ref={sampleInput} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff" multiple hidden onChange={e=>{if(e.target.files?.length)void importDrumSamples(e.target.files);e.currentTarget.value=''}}/></div><div className="sampler-assignments"><h3>Drum channels</h3><p>Choose a sample for each row. Assigned samples play in the Channel Rack and arrangement, and are included in WAV export.</p>{drumNames.map((name,row)=><div className="sampler-row" key={name} onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);const files=e.dataTransfer.files;if(files.length)void importDrumSamples(files).then(loaded=>{if(loaded[0])assignSampleToRow(loaded[0].id,row)})}}><span className="sampler-color" style={{background:colors[row]}}/><strong>{name}</strong><select aria-label={'Sample for '+name} value={rowSampleIds[row]} onChange={e=>assignSampleToRow(e.target.value,row)}><option value="">Built-in synthesized sound</option>{drumSamples.map(sample=><option key={sample.id} value={sample.id}>{sample.name}</option>)}</select><button className="secondary-button compact" onClick={()=>setView('Channel Rack')}>Open rack</button></div>)}</div><div className="sampler-library"><div className="sampler-library-heading"><h3>My samples <span>{drumSamples.length}</span></h3><input className="sample-search" aria-label="Search samples" placeholder="Search samples…" value={sampleSearch} onChange={e=>setSampleSearch(e.target.value)}/><span>SESSION LIBRARY · LOCAL ONLY</span></div>{drumSamples.length===0?<div className="sampler-empty"><FileAudio size={26}/><strong>Your sample library is empty</strong><p>Import free Afro House drum hits, percussion, loops or textures you have permission to use. WAV is recommended for best compatibility.</p><button className="secondary-button" onClick={()=>sampleInput.current?.click()}><Plus size={14}/> Add first samples</button></div>:filteredDrumSamples.length===0?<div className="sampler-empty"><strong>No matching samples</strong><p>Try a different search term.</p></div>:filteredDrumSamples.map(sample=><div className="sampler-file" key={sample.id}><div className="sampler-file-icon"><AudioWaveform size={17}/></div><div className="sampler-file-info"><strong>{sample.name}</strong><span>{sample.duration.toFixed(2)} sec · decoded locally</span></div><button className="secondary-button compact" onClick={()=>void previewDrumSample(sample)}><Play size={13}/> Preview</button><select aria-label={'Assign '+sample.name} value={rowSampleIds.findIndex(id=>id===sample.id)} onChange={e=>{const row=Number(e.target.value);if(row>=0)assignSampleToRow(sample.id,row)}}><option value={-1}>Assign to…</option>{drumNames.map((name,row)=><option key={name} value={row}>{name}</option>)}</select><button className="small-icon-button" title="Remove sample" onClick={()=>removeDrumSample(sample)}><Trash2 size={14}/></button></div>)}</div><div className="sampler-note"><Check size={15}/> Imported samples are saved in this browser on this PC. Project files remember sample assignments by ID and filename fallback; if you move to another PC, copy the original sample files too. Use sounds you own or have permission to use.</div></section>}
        {view==='Channel Rack'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Drum size={16}/></div><div><h2>Channel Rack</h2><p>Build a 16-step groove · click a step to toggle it</p></div></div><button className="secondary-button compact" onClick={()=>setSteps(rows=>rows.map((_,r)=>Array.from({length:16},(_,i)=>r===0?i%4===0:r===1?i===4||i===12:r===2?i%2===0:i%4===3)))}>Reset pattern</button></div><div className="step-grid"><div className="step-header"><span>CHANNEL</span>{Array.from({length:16},(_,i)=><span key={i} className={i%4===0?'beat-start':''}>{i+1}</span>)}</div>{drumNames.map((name,r)=><div className="step-row" key={name}><button className="channel-name" onClick={()=>{const assigned=drumSamples.find(sample=>sample.id===rowSampleIds[r]);if(assigned)void previewDrumSample(assigned);else void preview([65,180,800,230][r])}}><i style={{background:colors[r]}}/><span>{name}</span><Play size={12}/></button>{steps[r].map((on,i)=><button key={i} aria-label={name+' step '+(i+1)} className={'step '+(on?'on on-'+r:'')+' '+(i%4===0?'beat-start':'')} onClick={()=>setSteps(old=>old.map((row,j)=>j!==r?row:row.map((v,k)=>k===i?!v:v)))}/>)}</div>)}</div><div className="rack-footer"><span>{steps.reduce((n,row)=>n+row.filter(Boolean).length,0)} active steps</span><button className="primary-button" onClick={()=>{setView('Playlist');notify('Pattern ready to arrange.')}}><Plus size={15}/> Add pattern to Playlist</button></div></section>}
        {view==='Piano Roll'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><Music2 size={16}/></div><div><h2>Piano Roll</h2><p>Click to add notes, select notes to edit length and velocity · A minor</p></div></div><div className="piano-edit-controls"><label>Length <select aria-label="Selected note length" disabled={!selectedNote} value={selectedNote?.duration ?? 2} onChange={e=>{const duration=Number(e.target.value);if(selectedNote)setNotes(old=>old.map(note=>note.id===selectedNote.id?{...note,duration}:note))}}>{[1,2,3,4,6,8,12,16].map(length=><option key={length} value={length}>{length} step{length===1?'':'s'}</option>)}</select></label><label>Velocity <input aria-label="Selected note velocity" type="range" min="1" max="127" disabled={!selectedNote} value={selectedNote?.velocity ?? 100} onChange={e=>{const velocity=Number(e.target.value);if(selectedNote)setNotes(old=>old.map(note=>note.id===selectedNote.id?{...note,velocity}:note))}}/><span>{selectedNote?.velocity ?? '—'}</span></label><button className="secondary-button compact" disabled={!selectedNote} onClick={()=>{setNotes(old=>old.filter(note=>note.id!==selectedNoteId));setSelectedNoteId(null)}}><Trash2 size={13}/> Delete note</button><button className="secondary-button compact" onClick={()=>{setNotes([]);setSelectedNoteId(null)}}>Clear notes</button></div></div><div className="piano-grid-wrap"><div className="piano-keys">{['C5','B4','A♯4','A4','G4','F♯4','F4','E4','D♯4','D4','C♯4','C4'].map((key,i)=><div key={key} className={key.includes('♯')?'black-key':'white-key'}>{key}</div>)}</div><div className="piano-grid" onPointerDown={handlePianoPointerDown} onPointerMove={handlePianoPointerMove} onPointerUp={handlePianoPointerUp} onPointerCancel={handlePianoPointerUp}>{Array.from({length:12},(_,row)=><div className={'piano-row '+([0,3,7,10].includes(row)?'root-row':'')} key={row}>{Array.from({length:16},(_,col)=><button key={col} className={'piano-cell '+(col%4===0?'bar-cell':'')} onClick={()=>{const pitch=11-row;const found=notes.some(n=>n.step===col&&n.pitch===pitch);if(found){const note=notes.find(n=>n.step===col&&n.pitch===pitch);setSelectedNoteId(note?.id ?? null)}else{const id=Date.now();setNotes(old=>[...old,{id,step:col,pitch,duration:2,velocity:100}]);setSelectedNoteId(id)}}}/>)}{notes.filter(n=>n.pitch===11-row).map(n=><button key={n.id} data-note-id={n.id} className={'midi-note '+(selectedNoteId===n.id?'selected':'')} style={{left:(n.step/16*100)+'%',width:(Math.min(16-n.step,n.duration)/16*100)+'%',opacity:0.45+0.55*n.velocity/127}} onClick={()=>setSelectedNoteId(n.id)} title={'Drag to move · drag the right edge to resize · '+n.duration+' steps · velocity '+n.velocity}/>)}</div>)}</div></div><div className="piano-footer"><span>{notes.length} notes</span><span>Snap: 1/4 beat</span><span>Velocity <span className="velocity-bars">{notes.map(n=><i key={n.id} style={{height:(30+(n.pitch*7)%65)+'%'}}/>)}</span></span></div></section>}
        {view==='Mixer'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Mixer</h2><p>Channel levels · preview controls</p></div></div><button className="secondary-button compact" onClick={()=>{setMaster(78);setChannelLevels([78,66,72,55,60]);setMutedChannels([false,false,false,false,false,false])}}>Reset levels</button></div><div className="mixer-channels">{['Master','Kick','Percussion','Bass','Atmosphere','Reference'].map((name,i)=><div className="mixer-channel" key={name}><span className="mixer-number">0{i+1}</span><strong>{name}</strong><div className="meter"><i style={{height:[74,62,48,68,37,53][i]+'%'}}/><i style={{height:[63,53,41,57,29,44][i]+'%'}}/></div><input aria-label={name+' volume'} type="range" min="0" max="100" value={i===0?master:channelLevels[i-1]} onChange={e=>{const value=Number(e.target.value);if(i===0)setMaster(value);else setChannelLevels(old=>old.map((v,j)=>j===i-1?value:v))}}/><span className="db-value">{(20*Math.log10(Math.max(0.001,(i===0?master:channelLevels[i-1])/100))).toFixed(1)} dB</span><button onClick={()=>setMutedChannels(old=>old.map((muted,j)=>j===i?!muted:muted))} className={mutedChannels[i]?'mute-button muted':'mute-button'} aria-pressed={mutedChannels[i]} title={mutedChannels[i]?'Unmute '+name:'Mute '+name}>M</button></div>)}</div><p className="mixer-note"><Volume2 size={14}/> Full channel routing and effects need the dedicated audio engine.</p></section>}
        {view==='Reference Track'&&<section className="panel reference-panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><WandSparkles size={16}/></div><div><h2>AI Reference Track</h2><p>Use musical characteristics as inspiration for something original</p></div></div><b className="beta-tag large">EARLY ACCESS</b></div><div className="reference-drop" onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();importFile(e.dataTransfer.files?.[0])}}><div className="upload-orb"><FileAudio size={25}/></div><h3>{referenceName||'Drop a reference track here'}</h3><p>{referenceName?'Reference loaded. You can replace it with another audio file.':'Drag and drop an audio file, or browse your computer'}</p><span className="file-types">WAV · MP3 · FLAC · M4A</span><button className="secondary-button" onClick={e=>{e.stopPropagation();fileInput.current?.click()}}><Upload size={15}/> Choose audio file</button><button className="secondary-button" disabled={!audioUrl||playing} onClick={e=>{e.stopPropagation();const audio=audioElement.current;if(!audio)return;if(referencePreviewing){audio.pause();setReferencePreviewing(false)}else{audio.currentTime=0;void audio.play().then(()=>setReferencePreviewing(true)).catch(()=>notify('Could not preview this audio format in the browser.'))}}}>{referencePreviewing?<Pause size={15}/>:<Play size={15}/>} {referencePreviewing?'Pause preview':'Preview audio'}</button>{audioUrl&&<button className="secondary-button compact" onClick={e=>{e.stopPropagation();clearReference()}}><Trash2 size={14}/> Remove audio</button>}</div>{(analysis.length>0||analyzingReference)&&<div className="analysis-results"><h3><FileAudio size={16}/> Reference analysis</h3>{analyzingReference&&<div><Waves size={14}/> Analysing audio locally on this PC…</div>}{analysis.map(item=><div key={item}><Check size={14}/>{item}</div>)}{detectedBpm&&<button className="secondary-button compact" onClick={()=>{setBpm(detectedBpm);notify('Project tempo set to estimated '+detectedBpm+' BPM.')}}>Use {detectedBpm} BPM in project</button>}</div>}<div className="reference-options"><div className="section-subhead"><div><h3>Shape the direction</h3><p>Choose what matters in your new track</p></div><span className="local-tag"><i className="status-dot green"/> LOCAL-FIRST DESIGN</span></div><label className="prompt-label" htmlFor="ref-prompt">Describe the sound you're aiming for</label><textarea id="ref-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3}/><div className="reference-controls">{[['Groove',80],['Style',55],['Originality',85]].map(([name,val])=><label className="range-control" key={String(name)}><span>{name}<strong>{val}%</strong></span><input aria-label={String(name)} type="range" defaultValue={Number(val)} min="0" max="100"/></label>)}</div><div className="create-options"><span>GENERATE ELEMENTS</span>{['Drums','Bass','Melody','Chords','Atmosphere'].map((item,i)=><button key={item} className={'element-chip '+(generationElements.includes(item)?'chip-active':'')} aria-pressed={generationElements.includes(item)} onClick={()=>setGenerationElements(old=>old.includes(item)?old.filter(v=>v!==item):[...old,item])}><span>{['◉','≋','♫','◇','☼'][i]}</span>{item}</button>)}</div><button className="primary-button generate-button" onClick={generateAfroHouseIdea}><Sparkles size={16}/> Generate starting idea locally <span>→</span></button><p className="disclaimer">This creates editable drum steps and MIDI-style notes locally—no paid API. It is a procedural starting point, not AI audio generation or stem separation. Reference audio remains a separate track.</p></div></section>}
        {view==='Instruments'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Disc3 size={16}/></div><div><h2>Instruments</h2><p>Starter sound previews and future plugin slots</p></div></div><button className="secondary-button compact" onClick={()=>notify('VST3 hosting is planned for a later audio-engine milestone.')}><Plus size={14}/> Add plugin</button></div><div className="instrument-grid">{[{name:'Deep Kick',kind:'DRUM SYNTH',Icon:Drum,color:'lime',hz:65},{name:'Warm Bass',kind:'SYNTH',Icon:Waves,color:'purple',hz:110},{name:'Soft Keys',kind:'KEYS',Icon:Music2,color:'cyan',hz:440},{name:'Air Texture',kind:'ATMOSPHERE',Icon:Waves,color:'orange',hz:660}].map(item=><button className={'instrument-card '+(selectedInstrument===item.name?'instrument-selected':'')} key={item.name} onClick={()=>{setSelectedInstrument(item.name);void preview(item.hz);notify(item.name+' selected for Piano Roll playback.')}}><div className={'instrument-art '+item.color}><item.Icon size={25}/><span className="art-wave">∿ ∿ ∿</span></div><div className="instrument-meta"><span>{item.kind}</span><strong>{item.name}</strong><small>{selectedInstrument===item.name?'Selected · Piano Roll sound':'Click to select sound'}</small></div><Play size={16}/></button>)}</div><p className="mixer-note">Selected sound: <strong>{selectedInstrument}</strong>. This preset changes Piano Roll playback and is saved with your project. Full samplers and VST3 hosting are still planned.</p></section>}
        {view==='Effects'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Effects</h2><p>Planned processing chain</p></div></div></div>{['Low-cut EQ','Warm Compressor','Short Reverb','Tempo Delay'].map((name,i)=><div className="effect-row" key={name}><div className="effect-icon"><SlidersHorizontal size={18}/></div><div className="effect-info"><strong>{name}</strong><span>{['Remove subsonic rumble from the signal','Control peaks and add gentle glue','Add a short, subtle room-like echo','Create rhythmic echoes synced to BPM'][i]}</span></div><span className="effect-tag">{['EQ','DYNAMICS','SPACE','TIME'][i]}</span><button className={enabledEffects[i]?'primary-button compact':'secondary-button compact'} aria-pressed={enabledEffects[i]} onClick={()=>{setEnabledEffects(old=>old.map((v,j)=>i===j?!v:v));notify(name+(enabledEffects[i]?' disabled.':' enabled.'))}}>{enabledEffects[i]?'On':'Off'}</button></div>)}</section>}
        <div className="bottom-hint"><div className="hint-icon"><Sparkles size={15}/></div><div><strong>A little idea goes a long way.</strong><span>Start with a groove. Let the feeling lead.</span></div><button onClick={()=>setView('Reference Track')}>Try AI Reference Track <span>→</span></button></div>
      </main>
    </div>
    <footer className="statusbar"><div><i className="status-dot green"/> READY <span>|</span> Preview mode</div><div><span>44.1 kHz</span><span>|</span><span>Project: Untitled</span><span>|</span><span>Local-first</span></div><div><Bot size={12}/> EARLY BUILD</div></footer>
    {toast&&<div className="toast"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>
}

function HeadphonesFallback() { return <Volume2 size={16}/> }
