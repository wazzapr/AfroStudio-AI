import { useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { AudioWaveform, Bot, Check, ChevronDown, Copy, Disc3, Download, Drum, FileAudio, FolderOpen, Layers3, Music2, Pause, Play, Plus, Redo2, RefreshCw, Save, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, Undo2, Upload, Volume2, Waves, WandSparkles, X } from 'lucide-react'
import { exportArrangementWav } from './audio/exportWav'
import { exportPianoRollMidi } from './audio/exportMidi'
import { isSoundFontInstrumentReady, loadSoundFontInstrument, playSoundFontNote, SOUND_FONT_INSTRUMENTS } from './audio/soundfont'

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
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantMessages, setAssistantMessages] = useState<{role:'assistant'|'user';text:string}[]>([{role:'assistant',text:'Hi! I can operate the studio with local commands. Try “set BPM to 122”, “load trumpet”, “enable delay”, “make an Afro House idea”, or “open Piano Roll”. This first version uses built-in command rules, not a connected language model.'}])
  const [updateCheckState, setUpdateCheckState] = useState<'idle' | 'checking' | 'checked' | 'error'>('idle')
  const [latestUpdate, setLatestUpdate] = useState<{sha:string;message:string;date:string;url:string;installerUrl:string|null} | null>(null)
  const [updateCheckMessage, setUpdateCheckMessage] = useState('Check GitHub for the latest AfroStudio-AI changes.')
  const [lastUpdateCheck, setLastUpdateCheck] = useState('')
  const [bpm, setBpm] = useState(122)
  const [playing, setPlaying] = useState(false)
  const [master, setMaster] = useState(78)
  const [channelLevels, setChannelLevels] = useState([78, 66, 72, 55, 60])
  const [mutedChannels, setMutedChannels] = useState<boolean[]>([false, false, false, false, false, false])
  const [enabledEffects, setEnabledEffects] = useState<boolean[]>([false, false, false, false, false, false])
  const [selectedInstrument, setSelectedInstrument] = useState('Grand Piano')
  const [instrumentLoadMessage, setInstrumentLoadMessage] = useState('The Windows installer includes 32 sampled instruments. Select one to load and preview it.')
  const [drumSamples, setDrumSamples] = useState<DrumSample[]>([])
  const [rowSampleIds, setRowSampleIds] = useState<string[]>(['', '', '', ''])
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleSearch, setSampleSearch] = useState('')
  const [instrumentSearch, setInstrumentSearch] = useState('')
  const [instrumentCategory, setInstrumentCategory] = useState('ALL')
  const sampleInput = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreviewing, setReferencePreviewing] = useState(false)
  const [vocalPitchSemitones, setVocalPitchSemitones] = useState(0)
  const [analysis, setAnalysis] = useState<string[]>([])
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null)
  const [referenceGroove, setReferenceGroove] = useState<'sparse' | 'steady' | 'busy' | null>(null)
  const [grooveAmount, setGrooveAmount] = useState(80)
  const [styleInfluence, setStyleInfluence] = useState(55)
  const [generationDuration, setGenerationDuration] = useState(30)
  const [originalityAmount, setOriginalityAmount] = useState(85)
  const [analyzingReference, setAnalyzingReference] = useState(false)
  const [localAiUrl, setLocalAiUrl] = useState('http://127.0.0.1:7860')
  const [localAiStatus, setLocalAiStatus] = useState<'unchecked' | 'checking' | 'online' | 'offline'>('unchecked')
  const [localAiMessage, setLocalAiMessage] = useState('No local AI engine has been configured yet.')
  const [aceStepAvailable, setAceStepAvailable] = useState(false)
  const [aiAudioGenerating, setAiAudioGenerating] = useState(false)
  const [prompt, setPrompt] = useState('Warm, organic Afro House with soulful expressive vocals, deep rolling bass, hypnotic hand percussion, rich analog synths, evolving chords, natural dynamics, and an emotional sunset atmosphere. Original melody and lyrics, polished full-song arrangement.')
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
  const referenceAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const referenceEffectNodesRef = useRef<AudioNode[]>([])
  const audioImportRequestRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [sampleStorageReady, setSampleStorageReady] = useState(false)
  const [autosaveStatus, setAutosaveStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'unavailable'>('loading')
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
            setAutosaveStatus('saved');
            setBpm(Math.max(40, Math.min(240, data.bpm)))
      if (typeof data.generationDuration === 'number' && Number.isFinite(data.generationDuration)) setGenerationDuration(Math.max(10, Math.min(180, Math.round(data.generationDuration / 10) * 10)))
            setClips(data.clips as Clip[])
            setSteps(data.steps as boolean[][])
            setNotes((data.notes as {id:number;step:number;pitch:number;duration?:number;velocity?:number}[]).map(note => ({...note, duration: note.duration ?? 2, velocity: note.velocity ?? 100})))
            setReferenceName(typeof data.referenceName === 'string' ? data.referenceName : '')
            setMaster(typeof data.master === 'number' ? Math.max(0, Math.min(100, data.master)) : 78)
            setChannelLevels(Array.isArray(data.channelLevels) && data.channelLevels.length === 5 && data.channelLevels.every(v => typeof v === 'number') ? data.channelLevels.map(v => Math.max(0, Math.min(100, v as number))) : [78,66,72,55,60])
            setMutedChannels(Array.isArray(data.mutedChannels) && data.mutedChannels.length === 6 && data.mutedChannels.every(v => typeof v === 'boolean') ? data.mutedChannels as boolean[] : [false,false,false,false,false,false])
            setEnabledEffects(Array.isArray(data.enabledEffects) && data.enabledEffects.length === 6 && data.enabledEffects.every(v => typeof v === 'boolean') ? data.enabledEffects as boolean[] : [false,false,false,false,false,false])
       if (typeof data.vocalPitchSemitones === 'number' && Number.isFinite(data.vocalPitchSemitones)) setVocalPitchSemitones(Math.max(-12, Math.min(12, data.vocalPitchSemitones)))
            setSelectedInstrument(['Deep Kick','Warm Bass','Soft Keys','Air Texture', ...SOUND_FONT_INSTRUMENTS.map(item => item.name)].includes(String(data.selectedInstrument)) ? String(data.selectedInstrument) : 'Grand Piano')
            if (typeof data.prompt === 'string') setPrompt(data.prompt)
            if (typeof data.generationDuration === 'number' && Number.isFinite(data.generationDuration)) setGenerationDuration(Math.max(10, Math.min(180, Math.round(data.generationDuration / 10) * 10)))
            if (typeof data.grooveAmount === 'number' && Number.isFinite(data.grooveAmount)) setGrooveAmount(Math.max(0, Math.min(100, data.grooveAmount)))
            if (typeof data.styleInfluence === 'number' && Number.isFinite(data.styleInfluence)) setStyleInfluence(Math.max(0, Math.min(100, data.styleInfluence)))
            if (typeof data.originalityAmount === 'number' && Number.isFinite(data.originalityAmount)) setOriginalityAmount(Math.max(0, Math.min(100, data.originalityAmount)))
            if (Array.isArray(data.generationElements) && data.generationElements.every(value => ['Drums','Bass','Melody','Chords','Atmosphere'].includes(String(value)))) setGenerationElements(data.generationElements as string[])
            if (Array.isArray(data.rowSampleIds) && data.rowSampleIds.length === 4 && data.rowSampleIds.every(id => typeof id === 'string')) setRowSampleIds(data.rowSampleIds as string[])
          }
        }
      }
      setAutosaveStatus(current => current === 'saved' ? current : 'ready')
    } catch {
      // Storage can be disabled or full; keep the starter project usable.
      setAutosaveStatus('unavailable')
    }
    autosaveReady.current = true
  }, [])
  useEffect(() => {
    if (!autosaveReady.current || !sampleStorageReady) return
    const timeout = window.setTimeout(() => {
      try {
        setAutosaveStatus('saving')
        const rowSampleNames = rowSampleIds.map(id => drumSamples.find(sample => sample.id === id)?.name ?? '')
        const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationDuration, generationElements, grooveAmount, styleInfluence, originalityAmount, enabledEffects, selectedInstrument, vocalPitchSemitones, rowSampleNames, rowSampleIds }
        window.localStorage.setItem('afrostudio-project-autosave-v1', JSON.stringify(data))
        setAutosaveStatus('saved')
      } catch {
        // Do not interrupt music work if browser storage is unavailable or full.
        setAutosaveStatus('unavailable')
      }
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationDuration, generationElements, grooveAmount, styleInfluence, originalityAmount, enabledEffects, selectedInstrument, vocalPitchSemitones, rowSampleIds, drumSamples, sampleStorageReady])
  // Flush the newest project state immediately when the tab is closed or navigated away.
  // The debounced autosave is still used during editing, but a quick close should not lose
  // edits made during its 700 ms delay.
  useEffect(() => {
    if (!autosaveReady.current || !sampleStorageReady) return
    const saveOnPageHide = () => {
      try {
        const rowSampleNames = rowSampleIds.map(id => drumSamples.find(sample => sample.id === id)?.name ?? '')
        const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationDuration, generationElements, grooveAmount, styleInfluence, originalityAmount, enabledEffects, selectedInstrument, vocalPitchSemitones, rowSampleNames, rowSampleIds }
        window.localStorage.setItem('afrostudio-project-autosave-v1', JSON.stringify(data))
      } catch {
        // Closing the tab must never be blocked by storage failures.
      }
    }
    window.addEventListener('pagehide', saveOnPageHide)
    return () => window.removeEventListener('pagehide', saveOnPageHide)
  }, [bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationDuration, generationElements, grooveAmount, styleInfluence, originalityAmount, enabledEffects, selectedInstrument, vocalPitchSemitones, rowSampleIds, drumSamples, sampleStorageReady])
  useEffect(() => {
    let cancelled = false
    const restoreSamples = async () => {
      try {
        const stored = await readStoredSamples()
        if (cancelled) return
        if (!stored.length) { setSampleStorageReady(true); return }
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
        setSampleStorageReady(true)
      } catch { setSampleStorageReady(true); if (!cancelled) notify('Local sample storage is unavailable in this browser. You can still import samples for this session.') }
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
    const audio = audioElement.current
    if (!audio || !audioUrl) return
    const Ctx = window.AudioContext
    const ctx = audioContextRef.current || audioContext || new Ctx()
    if (!audioContextRef.current) audioContextRef.current = ctx
    if (!audioContext) setAudioContext(ctx)
    let source = referenceAudioSourceRef.current
    try {
      if (!source) {
        source = ctx.createMediaElementSource(audio)
        referenceAudioSourceRef.current = source
      }
      source.disconnect()
      for (const node of referenceEffectNodesRef.current) {
        try { if (node instanceof OscillatorNode) node.stop() } catch { /* Oscillator may already have stopped. */ }
        try { node.disconnect() } catch { /* Node may already be disconnected. */ }
      }
      const nodes: AudioNode[] = []
      let dry: AudioNode = source
      const addSerial = (node: AudioNode) => { dry.connect(node); nodes.push(node); dry = node }
      if (enabledEffects[0]) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'highpass'; filter.frequency.value = 70; filter.Q.value = 0.7
        addSerial(filter)
      }
      if (enabledEffects[1]) {
        const compressor = ctx.createDynamicsCompressor()
        compressor.threshold.value = -20; compressor.knee.value = 16; compressor.ratio.value = 2.8
        compressor.attack.value = 0.008; compressor.release.value = 0.2
        addSerial(compressor)
      }
      dry.connect(ctx.destination)
      const addEcho = (seconds: number, feedbackAmount: number, wetAmount: number) => {
        const delay = ctx.createDelay(1.2), feedback = ctx.createGain(), wet = ctx.createGain()
        delay.delayTime.value = seconds; feedback.gain.value = feedbackAmount; wet.gain.value = wetAmount
        dry.connect(delay); delay.connect(wet).connect(ctx.destination); delay.connect(feedback).connect(delay)
        nodes.push(delay, feedback, wet)
      }
      if (enabledEffects[2]) addEcho(0.045, 0.18, 0.16)
      if (enabledEffects[3]) addEcho(60 / bpm / 2, 0.24, 0.2)
      if (enabledEffects[4]) {
        const length = Math.max(1, Math.floor(ctx.sampleRate * 1.6))
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel)
          for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8)
        }
        const convolver = ctx.createConvolver(), wet = ctx.createGain()
        convolver.buffer = impulse; wet.gain.value = 0.22
        dry.connect(convolver); convolver.connect(wet).connect(ctx.destination)
        nodes.push(convolver, wet)
      }
      if (enabledEffects[5]) {
        const delay = ctx.createDelay(0.06), lfo = ctx.createOscillator(), depth = ctx.createGain(), wet = ctx.createGain()
        delay.delayTime.value = 0.025; lfo.frequency.value = 0.65; depth.gain.value = 0.007; wet.gain.value = 0.18
        lfo.connect(depth).connect(delay.delayTime); dry.connect(delay); delay.connect(wet).connect(ctx.destination); lfo.start()
        nodes.push(delay, lfo, depth, wet)
      }
      referenceEffectNodesRef.current = nodes
      if (ctx.state === 'suspended') void ctx.resume()
    audio.playbackRate = Math.pow(2, vocalPitchSemitones / 12)
    const pitchableAudio = audio as HTMLMediaElement & { preservesPitch?: boolean; mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean }
    if ('preservesPitch' in pitchableAudio) pitchableAudio.preservesPitch = false
    if ('mozPreservesPitch' in pitchableAudio) pitchableAudio.mozPreservesPitch = false
    if ('webkitPreservesPitch' in pitchableAudio) pitchableAudio.webkitPreservesPitch = false
    } catch {
      // Keep the imported file usable even if the browser cannot create a media-element audio route.
      try { audioElement.current?.load() } catch { /* Browser fallback only. */ }
    }
    return () => {
      try { source?.disconnect() } catch { /* Ignore already-disconnected nodes. */ }
      for (const node of referenceEffectNodesRef.current) {
        try { if (node instanceof OscillatorNode) node.stop() } catch { /* Oscillator may already have stopped. */ }
        try { node.disconnect() } catch { /* Ignore already-disconnected nodes. */ }
      }
      referenceEffectNodesRef.current = []
    }
  }, [audioUrl, audioContext, enabledEffects, bpm, vocalPitchSemitones])
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
    setBpm(snapshot.bpm); setClips(snapshot.clips); setSteps(snapshot.steps); setNotes(snapshot.notes); setMaster(snapshot.master); setChannelLevels(snapshot.channelLevels); setEnabledEffects(snapshot.enabledEffects ?? [false,false,false,false,false,false]); setSelectedInstrument(snapshot.selectedInstrument ?? 'Soft Keys')
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
  const checkLocalAiEngine = async () => {
    const baseUrl = localAiUrl.trim().replace(/\/$/, '')
    if (!/^https?:\/\//i.test(baseUrl)) {
      setLocalAiStatus('offline')
      setLocalAiMessage('Enter a local engine URL beginning with http:// or https://.')
      return
    }
    setAceStepAvailable(false)
    setLocalAiStatus('checking')
    setLocalAiMessage('Checking the local engine health endpoint…')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 3500)
    try {
      const response = await fetch(baseUrl + '/health', { signal: controller.signal })
      if (!response.ok) throw new Error('Health endpoint returned HTTP ' + response.status + '.')
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object') throw new Error('The health endpoint did not return JSON.')
      const data = result as Record<string, unknown>
      if (data.status !== 'ok' && data.status !== 'healthy') throw new Error('Engine responded, but did not report status "ok" or "healthy".')
      const health = data
      let statusMessage = 'Engine is reachable, but it does not expose model status. Music generation is not confirmed.'
      try {
        const statusResponse = await fetch(baseUrl + '/status', { signal: controller.signal })
        if (statusResponse.ok) {
          const statusResult: unknown = await statusResponse.json()
          if (statusResult && typeof statusResult === 'object') {
            const statusData = statusResult as Record<string, unknown>
            const model = statusData.model && typeof statusData.model === 'object' ? statusData.model as Record<string, unknown> : null
            const capabilities = statusData.capabilities && typeof statusData.capabilities === 'object' ? statusData.capabilities as Record<string, unknown> : null
            const provider = statusData.provider && typeof statusData.provider === 'object' ? statusData.provider as Record<string, unknown> : null
            setAceStepAvailable(provider?.available === true && capabilities?.music_generation === true)
            if (provider?.available === true && capabilities?.music_generation === true) {
              statusMessage = 'ACE-Step API is reachable. Model readiness is not verified until a generation succeeds.'
            } else if (model?.installed === false) {
              statusMessage = 'Local bridge connected, but no music model is installed yet. This connection does not generate audio.'
            } else if (capabilities?.music_generation === false) {
              statusMessage = 'Local bridge connected, but music generation is not enabled by this engine.'
            }
          }
        }
      } catch {
        statusMessage = 'Engine is reachable. Model status endpoint is unavailable; music generation is not confirmed.'
      }
      setLocalAiStatus('online')
      setLocalAiMessage(statusMessage)
    } catch (error) {
      setAceStepAvailable(false)
      setLocalAiStatus('offline')
      setLocalAiMessage(error instanceof Error && error.name === 'AbortError' ? 'Timed out. Make sure the local engine is running.' : 'Could not connect. The engine must run locally and allow requests from this app.')
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const generateAiAudio = async () => {
    const baseUrl = localAiUrl.trim().replace(/\/$/, '')
    if (!aceStepAvailable) {
      notify('Connect a running ACE-Step API first. This PC may be below the model hardware requirements.')
      return
    }
    setAiAudioGenerating(true)
    try {
      const requestBody = new FormData()
      requestBody.set('prompt', prompt.trim())
      requestBody.set('bpm', String(bpm))
      requestBody.set('duration', String(generationDuration))
      requestBody.set('style_influence', String(styleInfluence / 100))
      if (referenceFile) requestBody.set('reference_audio', referenceFile, referenceFile.name)
      const response = await fetch(baseUrl + '/generate', { method: 'POST', body: requestBody })
      const result: unknown = await response.json()
      if (!response.ok) {
        const message = result && typeof result === 'object' && 'message' in result ? String((result as {message: unknown}).message) : 'The local AI engine rejected the generation request.'
        throw new Error(message)
      }
      if (!result || typeof result !== 'object' || !('task_id' in result)) throw new Error('The local engine returned an invalid generation task.')
      const taskId = String((result as {task_id: unknown}).task_id)
      notify('AI generation started. This may take a while on a low-end PC.')
      const maxAttempts = Math.ceil(Math.max(1200, generationDuration * 20) / 3)
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise<void>(resolve => window.setTimeout(resolve, 3000))
        const taskResponse = await fetch(baseUrl + '/tasks/' + encodeURIComponent(taskId))
        const task: unknown = await taskResponse.json()
        if (!taskResponse.ok || !task || typeof task !== 'object') throw new Error('Could not check the AI generation status.')
        const taskData = task as {status?: unknown; message?: unknown; audio_url?: unknown}
        if (taskData.status === 'failed') throw new Error(String(taskData.message || 'AI audio generation failed.'))
        if (taskData.status === 'succeeded' && typeof taskData.audio_url === 'string') {
          const audioResponse = await fetch(baseUrl + taskData.audio_url)
          if (!audioResponse.ok) throw new Error('The generated audio could not be downloaded from the local engine.')
          const blob = await audioResponse.blob()
          if (!blob.size) throw new Error('The AI engine returned an empty audio file.')
          const file = new File([blob], 'AfroStudio AI generated.wav', { type: blob.type || 'audio/wav' })
          importFile(file)
          setView('Playlist')
          notify('AI audio generated and added to the Playlist reference lane.')
          return
        }
      }
      throw new Error('Generation is still running after the allowed wait for this audio length. Check the local engine console before trying again.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI audio generation failed.')
    } finally {
      setAiAudioGenerating(false)
    }
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
        Array.from({length:16},(_,i)=>{const density=grooveAmount/100;const profileBias=referenceGroove==='sparse'?-0.18:referenceGroove==='busy'?0.18:0;const threshold=Math.max(0.18,Math.min(0.95,0.25+density*0.55+profileBias*styleInfluence/100));return i%2===0 ? Math.random()<threshold : Math.random()<Math.max(0,density-0.58)*0.7}),
        Array.from({length:16},(_,i)=>[3,7,11,15].includes(i) && Math.random()>(0.68-(styleInfluence/100)*0.24-(grooveAmount/100)*0.15)),
      ])
      if (matchedSampleCount) setRowSampleIds(old => old.map((id, row) => matchedSamples[row] || id))
    }
    if (selected.has('Melody') || selected.has('Chords') || selected.has('Atmosphere')) {
      const afroScale = [0,2,3,5,7,8,10]
      const pentatonicScale = [0,2,4,7,9]
      const scale = originalityAmount>70 ? afroScale : styleInfluence>65 ? afroScale : pentatonicScale
      const positions = selected.has('Atmosphere') ? [0,4,8,12] : originalityAmount>75 ? [0,2,5,7,9,12,14,15] : styleInfluence>65 ? [0,3,6,8,11,14] : [0,2,5,7,9,12,14,15]
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
    notify((referenceTempo ? 'Created a local Afro House idea at the reference tempo (' + referenceTempo + ' BPM)' + (referenceGroove ? ' using the rough ' + referenceGroove + ' transient profile.' : '.') + ' This is heuristic pattern generation, not AI audio remixing or stem separation.' : 'Created an original Afro House starting idea locally. Refine it in the Channel Rack and Piano Roll.') + sampleNote)
  }
  const runStudioCommand = (rawCommand: string) => {
    const command = rawCommand.trim()
    if (!command) return
    // Allow several studio actions in one message, separated by commas or the word 'then'.
    const sequence = command.split(/\s*(?:,|\bthen\b)\s*/i).map(part => part.trim()).filter(Boolean)
    if (sequence.length > 1) {
      sequence.forEach(part => runStudioCommand(part))
      return
    }
    setAssistantMessages(old => [...old, { role: 'user', text: command }])
    const lower = command.toLowerCase()
    let reply = 'I could not match that command yet. Try setting BPM, loading an instrument, enabling an effect, generating an Afro House idea, adding a clip, or opening a studio page.'
    const tempoMatch = lower.match(/(?:bpm|tempo)(?:\s+to|\s*=|\s+at)?\s*(\d{2,3})/)
    if (tempoMatch) {
      const tempo = Math.max(40, Math.min(240, Number(tempoMatch[1])))
      setBpm(tempo)
      reply = 'Done — project tempo set to ' + tempo + ' BPM.'
    } else if (/\b(master volume|master|volume)\b/.test(lower) && /\b(set|change|turn|to|at)\b/.test(lower)) {
      const volumeMatch = lower.match(/(?:to|at|=)\s*(\d{1,3})\s*%?/)
      if (volumeMatch) {
        const volume = Math.max(0, Math.min(100, Number(volumeMatch[1])))
        setMaster(volume)
        reply = 'Master output set to ' + volume + '%.'
      } else {
        reply = 'Choose a master volume from 0 to 100, for example “set master volume to 75”.'
      }
    } else if (/\b(vocal pitch|pitch shift|transpose vocals?)\b/.test(lower)) {
      const pitchMatch = lower.match(/(?:to|by|at|=)\s*([+-]?\d{1,2})/)
      if (pitchMatch) {
        const semitones = Math.max(-12, Math.min(12, Number(pitchMatch[1])))
        setVocalPitchSemitones(semitones)
        reply = 'Vocal preview pitch set to ' + (semitones > 0 ? '+' : '') + semitones + ' semitones. This simple control also changes playback speed.'
      } else {
        reply = 'Choose a pitch change from -12 to +12 semitones, for example “set vocal pitch to +2”.'
      }
    } else if (/\b(make|generate|create)\b.*\b(afro house|groove|starting idea|beat|pattern)\b/.test(lower)) {
      generateAfroHouseIdea()
      reply = 'Created an editable local Afro House starting idea. I updated the Channel Rack steps, Piano Roll notes and Playlist clips where selected. This is procedural generation, not a full AI audio remix.'
    } else if (/\b(enable|turn on|activate)\b/.test(lower) && /\b(delay|echo|eq|compressor|compression|reverb|chorus|vocal doubler|effect)\b/.test(lower)) {
      const effectIndex = /\b(reverb|room)\b/.test(lower) ? 4 : /\b(chorus|vocal doubler|thicken)\b/.test(lower) ? 5 : /\b(short echo|slapback)\b/.test(lower) ? 2 : /\b(delay|echo)\b/.test(lower) ? 3 : /\b(eq|low.cut)\b/.test(lower) ? 0 : 1
      setEnabledEffects(old => old.map((value, index) => index === effectIndex ? true : value))
      reply = 'Enabled ' + ['Low-cut EQ','Warm Compressor','Short Echo','Tempo Delay','Studio Reverb','Chorus / Vocal Doubler'][effectIndex] + ' for instrument, drum, and imported-audio preview playback.'
    } else if (/\b(disable|turn off)\b/.test(lower) && /\b(delay|echo|eq|compressor|compression|reverb|chorus|vocal doubler|effect)\b/.test(lower)) {
      const effectIndex = /\b(reverb|room)\b/.test(lower) ? 4 : /\b(chorus|vocal doubler|thicken)\b/.test(lower) ? 5 : /\b(short echo|slapback)\b/.test(lower) ? 2 : /\b(delay|echo)\b/.test(lower) ? 3 : /\b(eq|low.cut)\b/.test(lower) ? 0 : 1
      setEnabledEffects(old => old.map((value, index) => index === effectIndex ? false : value))
      reply = 'Disabled ' + ['Low-cut EQ','Warm Compressor','Short Echo','Tempo Delay','Studio Reverb','Chorus / Vocal Doubler'][effectIndex] + '.'
    } else if (/\b(add|create)\b.*\b(clip|track|pattern)\b/.test(lower)) {
      const isBass = /bass/.test(lower)
      const isMelody = /melody|piano|lead/.test(lower)
      const lane = isBass ? 1 : isMelody ? 3 : 0
      const name = isBass ? 'Assistant bass clip' : isMelody ? 'Assistant melody clip' : 'Assistant Afro groove'
      const clip = { id: Date.now(), name, duration: 8, color: colors[lane], lane, startBar: 0 }
      setClips(old => [...old, clip])
      setSelectedClipId(clip.id)
      setView('Playlist')
      reply = 'Added "' + name + '" to the Playlist at bar 1. You can move and resize it there.'
    } else if (/\b(open|show|go to)\b/.test(lower)) {
      const pages = ['Piano Roll','Channel Rack','Playlist','Sampler','Mixer','Instruments','Effects','Reference Track','Updates']
      const page = pages.find(item => lower.includes(item.toLowerCase()))
      if (page) { setView(page); reply = 'Opened ' + page + '.' }
    } else {
      const requestedInstrument = SOUND_FONT_INSTRUMENTS.find(item => lower.includes(item.name.toLowerCase()))
      if (requestedInstrument || /\b(load|select|use)\b.*\b(piano|guitar|bass|trumpet|horn|flute|strings|pad)\b/.test(lower)) {
        const instrument = requestedInstrument ?? SOUND_FONT_INSTRUMENTS.find(item => lower.includes(item.category.toLowerCase()) || lower.includes(item.name.split(' ')[0].toLowerCase()))
        if (instrument) {
          setView('Instruments')
          void selectInstrument(instrument.name)
          reply = 'Loading ' + instrument.name + '. Its sampled sound needs an internet connection on first use; once loaded, choose notes in Piano Roll.'
        }
      }
    }
    setAssistantMessages(old => [...old, { role: 'assistant', text: reply }])
  }
  const submitStudioCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const command = assistantInput
    setAssistantInput('')
    runStudioCommand(command)
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
  const renameSelectedClip = (clipId = selectedClipId) => {
    if (clipId === null) { notify('Select a Playlist clip first.'); return }
    const clip = clips.find(item => item.id === clipId)
    if (!clip) return
    const name = window.prompt('Rename Playlist clip', clip.name)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) { notify('Clip name cannot be empty.'); return }
    setClips(old => old.map(item => item.id === clipId ? { ...item, name: trimmed } : item))
    notify('Clip renamed.')
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
    if (effects[4]) {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 1.4))
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel)
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6)
      }
      const convolver = ctx.createConvolver(), wet = ctx.createGain()
      convolver.buffer = impulse; wet.gain.value = 0.2
      output.connect(convolver); convolver.connect(wet).connect(ctx.destination)
      window.setTimeout(() => { convolver.disconnect(); wet.disconnect() }, 3500)
    }
    if (effects[5]) {
      const delay = ctx.createDelay(0.06), lfo = ctx.createOscillator(), depth = ctx.createGain(), wet = ctx.createGain()
      delay.delayTime.value = 0.025; lfo.frequency.value = 0.7; depth.gain.value = 0.008; wet.gain.value = 0.18
      lfo.connect(depth).connect(delay.delayTime); output.connect(delay); delay.connect(wet).connect(ctx.destination)
      lfo.start()
      window.setTimeout(() => { try { lfo.stop() } catch {} delay.disconnect(); lfo.disconnect(); depth.disconnect(); wet.disconnect() }, 3500)
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
    const now = ctx.currentTime
    const instrument = playbackStateRef.current.selectedInstrument
    const channelLevel = channelLevels[channelIndex] ?? 100
    const mixerIndex = channelIndex === 2 ? 3 : 4
    const muted = mutedChannels[0] || mutedChannels[mixerIndex]
    const noteDuration = Math.max(0.04, Math.min(8, duration))
    if (isSoundFontInstrumentReady(ctx, instrument)) {
      const output = ctx.createGain()
      output.gain.value = 1
      connectProcessedOutput(ctx, output)
      void playSoundFontNote(ctx, instrument, output, 60 + pitch, noteDuration, muted ? 0 : Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, channelLevel / 100)) * Math.max(0, Math.min(1, level)) * 0.8)
        .catch(error => notify(error instanceof Error ? error.message : 'Sample instrument playback failed.'))
      return
    }
    const osc = ctx.createOscillator(), env = ctx.createGain(), filter = ctx.createBiquadFilter()
    const presets: Record<string, {wave: OscillatorType; cutoff: number; gain: number; octave: number; attack: number; release: number}> = {
      'Deep Kick': {wave:'sine', cutoff:260, gain:0.34, octave:-12, attack:0.006, release:0.16},
      'Warm Bass': {wave:'sawtooth', cutoff:520, gain:0.22, octave:-12, attack:0.012, release:0.1},
      'Soft Keys': {wave:'triangle', cutoff:2400, gain:0.14, octave:0, attack:0.025, release:0.18},
      'Air Texture': {wave:'sine', cutoff:5200, gain:0.12, octave:12, attack:0.08, release:0.32},
    }
    const preset = presets[instrument] ?? presets['Soft Keys']
    osc.type = preset.wave; osc.frequency.value = 440 * Math.pow(2, ((60 + pitch + preset.octave) - 69) / 12)
    filter.type = 'lowpass'; filter.frequency.value = preset.cutoff
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
      if (!typing && view === 'Piano Roll' && selectedNoteId !== null && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const selected = notes.find(note => note.id === selectedNoteId)
        if (selected) {
          const step = Math.min(15, selected.step + Math.max(1, selected.duration))
          if (step === selected.step || step >= 16) { notify('There is no room to duplicate this note later in the pattern.'); return }
          const copy = { ...selected, id: Date.now(), step, duration: Math.min(selected.duration, 16 - step) }
          setNotes(old => [...old, copy]); setSelectedNoteId(copy.id); notify('Note duplicated.')
        }
        return
      }
      if (!typing && view === 'Piano Roll' && selectedNoteId !== null && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        const vertical = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
        setNotes(old => old.map(note => {
          if (note.id !== selectedNoteId) return note
          if (event.shiftKey && horizontal !== 0) return { ...note, duration: Math.max(1, Math.min(16 - note.step, note.duration + horizontal)) }
          return { ...note, step: Math.max(0, Math.min(15, note.step + horizontal)), pitch: Math.max(0, Math.min(11, note.pitch + vertical)) }
        }))
        return
      }
      if (!typing && view === 'Playlist' && selectedClipId !== null && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); setClips(old => old.filter(clip => clip.id !== selectedClipId)); setSelectedClipId(null); notify('Selected clip deleted.'); return }
      if (!typing && view === 'Piano Roll' && selectedNoteId !== null && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); setNotes(old => old.filter(note => note.id !== selectedNoteId)); setSelectedNoteId(null); return }
      if (event.code === 'Space' && !typing) { event.preventDefault(); setPlaying(v => !v); return }
      if (!typing && view === 'Playlist' && event.key === 'F2') { event.preventDefault(); renameSelectedClip(); return }
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
  const selectInstrument = async (name: string, hz = 440) => {
    setSelectedInstrument(name)
    if (!SOUND_FONT_INSTRUMENTS.some(item => item.name === name)) {
      setInstrumentLoadMessage(name + ' is a built-in synthesized preset.')
      void preview(hz)
      notify(name + ' selected.')
      return
    }
    setInstrumentLoadMessage('Loading ' + name + ' samples from the free SoundFont library…')
    try {
      const ctx = audioContextRef.current || audioContext || new window.AudioContext()
      if (!audioContextRef.current) audioContextRef.current = ctx
      if (!audioContext) setAudioContext(ctx)
      if (ctx.state === 'suspended') await ctx.resume()
      await loadSoundFontInstrument(ctx, name)
      setInstrumentLoadMessage(name + ' is ready. Its sampled sound will play in the Piano Roll and arrangement.')
      await playSoundFontNote(ctx, name, ctx.destination, 60, 1.1, 0.7)
      notify(name + ' loaded and ready to play.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load this instrument.'
      setInstrumentLoadMessage(message)
      notify(message)
    }
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
      const activeOnsets = onset.reduce((count, value) => count + (value > mean * 2.2 ? 1 : 0), 0)
      const onsetRate = activeOnsets / Math.max(1, seconds)
      const groove = onsetRate < 3.5 ? 'sparse' : onsetRate > 8 ? 'busy' : 'steady'
      setDetectedBpm(bestTempo || null)
      setReferenceGroove(groove)
      setAnalysis(old => [...old, bestTempo ? 'Experimental local BPM estimate: about ' + bestTempo + ' BPM (check by ear).' : 'Local BPM estimate unavailable.', 'Experimental transient profile: ' + groove + ' (' + onsetRate.toFixed(1) + ' prominent changes/second). This is a rough audio heuristic, not AI genre recognition.'])
    } catch {
      if (requestId === audioImportRequestRef.current) setAnalysis(old => [...old, 'Local analysis could not decode this format in the browser.'])
    } finally {
      if (requestId === audioImportRequestRef.current) setAnalyzingReference(false)
    }
  }
  const resetReferenceAudioRouting = () => {
    try { referenceAudioSourceRef.current?.disconnect() } catch { /* Old source may already be disconnected. */ }
    referenceAudioSourceRef.current = null
    for (const node of referenceEffectNodesRef.current) {
      try { if (node instanceof OscillatorNode) node.stop() } catch { /* Oscillator may already have stopped. */ }
      try { node.disconnect() } catch { /* Ignore already-disconnected nodes. */ }
    }
    referenceEffectNodesRef.current = []
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
      setReferenceFile(file)
      resetReferenceAudioRouting()
      setAudioUrl(url); audioElement.current = audio
      audio.onended = () => setReferencePreviewing(false)
      const barDuration = 4 * 60 / bpm; const clipStart = Math.max(0, Math.min(15, Math.floor(startBar))); const clipBars = Math.max(1, Math.min(16 - clipStart, Math.ceil(duration / barDuration))); setClips(old => [...old.filter(c => !(c.lane === 2 && c.name === 'Reference · drop a song')), { id: Date.now(), name: file.name, duration: clipBars, color: colors[2], lane: 2, startBar: clipStart }])
      setDetectedBpm(null)
      setReferenceGroove(null)
      setDetectedBpm(null)
      setAnalysis(['Audio loaded · ' + Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0'), 'Running lightweight local tempo and transient-profile analysis. Key detection, stem separation and AI audio remixing are not available yet.'])
      void analyzeReferenceLocally(file, requestId)
      notify('Reference imported. Local tempo analysis started.')
    }
    audio.onerror = () => {
      if (requestId !== audioImportRequestRef.current) { discardStaleImport(); return }
      setReferenceName(file.name); setReferenceFile(file); resetReferenceAudioRouting(); setAnalysis(['File selected: ' + file.name, 'Could not read duration in the browser.']); setAudioUrl(url); audioElement.current = audio
      audio.onended = () => setReferencePreviewing(false)
    }
    audio.load()
  }
  const clearReference = () => {
    audioImportRequestRef.current += 1
    audioElement.current?.pause()
    resetReferenceAudioRouting()
    audioElement.current = null
    setReferencePreviewing(false)
    setReferenceName('')
    setReferenceFile(null)
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
    const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, mutedChannels, prompt, generationDuration, generationElements, grooveAmount, styleInfluence, originalityAmount, enabledEffects, selectedInstrument, vocalPitchSemitones, rowSampleNames, rowSampleIds }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'afrostudio-project.json'; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Project data exported.')
  }
  const loadProject = async (file?: File) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid project')
      const data = parsed as Record<string, unknown>
      if (data.app !== 'AfroStudio AI' || typeof data.bpm !== 'number' || !Number.isFinite(data.bpm) || !Array.isArray(data.clips) || !Array.isArray(data.steps) || !Array.isArray(data.notes)) {
        throw new Error('This is not a supported AfroStudio project file.')
      }
      if (!sampleStorageReady) {
        notify('Please wait for the local sample library to finish loading, then open the project again.')
        return
      }
      const validSteps = data.steps.length === 4 && data.steps.every(row => Array.isArray(row) && row.length === 16 && row.every(value => typeof value === 'boolean'))
      const validClips = data.clips.every((clip: unknown) => {
        if (!clip || typeof clip !== 'object') return false
        const item = clip as Record<string, unknown>
        return typeof item.id === 'number' && Number.isFinite(item.id) && typeof item.name === 'string' && typeof item.duration === 'number' &&
          typeof item.color === 'string' && typeof item.lane === 'number' && Number.isInteger(item.lane) && item.lane >= 0 && item.lane <= 3 && Number.isFinite(item.duration) && item.duration >= 1 && item.duration <= 64 && (item.startBar === undefined || (typeof item.startBar === 'number' && Number.isInteger(item.startBar) && item.startBar >= 0 && item.startBar <= 15))
      })
      const validNotes = data.notes.every((note: unknown) => {
        if (!note || typeof note !== 'object') return false
        const item = note as Record<string, unknown>
        return typeof item.id === 'number' && Number.isFinite(item.id) && typeof item.step === 'number' && Number.isInteger(item.step) && item.step >= 0 && item.step < 16 &&
          typeof item.pitch === 'number' && Number.isInteger(item.pitch) && item.pitch >= 0 && item.pitch < 12 && (item.duration === undefined || (typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 1 && item.duration <= 16)) && (item.velocity === undefined || (typeof item.velocity === 'number' && Number.isFinite(item.velocity) && item.velocity >= 1 && item.velocity <= 127))
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
      if (typeof data.generationDuration === 'number' && Number.isFinite(data.generationDuration)) setGenerationDuration(Math.max(10, Math.min(180, Math.round(data.generationDuration / 10) * 10)))
      setClips(data.clips as Clip[])
      setSteps(data.steps as boolean[][])
      setNotes((data.notes as {id:number;step:number;pitch:number;duration?:number;velocity?:number}[]).map(note => ({...note,duration:note.duration ?? 2,velocity:note.velocity ?? 100})))
      setSelectedNoteId(null)
      setSelectedInstrument(['Deep Kick','Warm Bass','Soft Keys','Air Texture', ...SOUND_FONT_INSTRUMENTS.map(item => item.name)].includes(String(data.selectedInstrument)) ? String(data.selectedInstrument) : 'Grand Piano')
      setMutedChannels(Array.isArray(data.mutedChannels) && data.mutedChannels.length === 6 && data.mutedChannels.every(v => typeof v === 'boolean') ? data.mutedChannels as boolean[] : [false,false,false,false,false,false])
      setEnabledEffects(Array.isArray(data.enabledEffects) && data.enabledEffects.length === 6 && data.enabledEffects.every(v => typeof v === 'boolean') ? data.enabledEffects as boolean[] : [false,false,false,false,false,false])
      if (typeof data.vocalPitchSemitones === 'number' && Number.isFinite(data.vocalPitchSemitones)) setVocalPitchSemitones(Math.max(-12, Math.min(12, data.vocalPitchSemitones)))
      setMaster(typeof data.master === 'number' ? Math.max(0, Math.min(100, data.master)) : 78)
      setChannelLevels(Array.isArray(data.channelLevels) && data.channelLevels.length === 5 && data.channelLevels.every(v => typeof v === 'number') ? data.channelLevels.map(v => Math.max(0, Math.min(100, v as number))) : [78, 66, 72, 55, 60])
      if (typeof data.prompt === 'string') setPrompt(data.prompt)
      if (typeof data.grooveAmount === 'number' && Number.isFinite(data.grooveAmount)) setGrooveAmount(Math.max(0, Math.min(100, data.grooveAmount)))
      if (typeof data.styleInfluence === 'number' && Number.isFinite(data.styleInfluence)) setStyleInfluence(Math.max(0, Math.min(100, data.styleInfluence)))
      if (typeof data.originalityAmount === 'number' && Number.isFinite(data.originalityAmount)) setOriginalityAmount(Math.max(0, Math.min(100, data.originalityAmount)))
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
  const checkForUpdates = async () => {
    setUpdateCheckState('checking')
    setUpdateCheckMessage('Checking the latest code and Windows installer…')
    try {
      const headers = { Accept: 'application/vnd.github+json' }
      const [commitResponse, releaseResponse] = await Promise.all([
        fetch('https://api.github.com/repos/wazzapr/AfroStudio-AI/commits/feat/studio-foundation', { headers, cache: 'no-store' }),
        fetch('https://api.github.com/repos/wazzapr/AfroStudio-AI/releases/tags/nightly', { headers, cache: 'no-store' }),
      ])
      if (!commitResponse.ok) throw new Error(commitResponse.status === 403 ? 'GitHub rate limit reached. Try again later.' : 'GitHub could not be reached right now.')
      const data: unknown = await commitResponse.json()
      if (!data || typeof data !== 'object') throw new Error('GitHub returned an unexpected response.')
      const commit = data as {sha?:unknown;html_url?:unknown;commit?:{message?:unknown;committer?:{date?:unknown}}}
      if (typeof commit.sha !== 'string') throw new Error('GitHub did not return a commit version.')
      const message = typeof commit.commit?.message === 'string' ? commit.commit.message.split(String.fromCharCode(10))[0] : 'Latest project changes'
      const date = typeof commit.commit?.committer?.date === 'string' ? commit.commit.committer.date : ''
      const url = typeof commit.html_url === 'string' ? commit.html_url : 'https://github.com/wazzapr/AfroStudio-AI/commits/feat/studio-foundation'
      let installerUrl: string | null = null
      if (releaseResponse.ok) {
        const releaseData: unknown = await releaseResponse.json()
        if (releaseData && typeof releaseData === 'object') {
          const release = releaseData as {assets?:unknown}
          if (Array.isArray(release.assets)) {
            const installer = release.assets.find((asset: unknown) => asset && typeof asset === 'object' && typeof (asset as {name?:unknown}).name === 'string' && String((asset as {name:string}).name).toLowerCase().endsWith('.exe')) as {browser_download_url?:unknown} | undefined
            if (installer && typeof installer.browser_download_url === 'string') installerUrl = installer.browser_download_url
          }
        }
      }
      setLatestUpdate({ sha: commit.sha, message, date, url, installerUrl })
      setLastUpdateCheck(new Date().toLocaleString())
      window.localStorage.setItem('afrostudio-last-seen-update-sha', commit.sha)
      setUpdateCheckState('checked')
      setUpdateCheckMessage(installerUrl
        ? 'The latest Windows installer is available. Download it, close AfroStudio, then run the installer to update.'
        : 'Latest source checked, but the Windows installer is not published yet. Try again after the installer build finishes.')
    } catch (error) {
      setUpdateCheckState('error')
      setUpdateCheckMessage(error instanceof Error ? error.message : 'Could not check for updates.')
    }
  }
  const downloadLatestUpdate = () => {
    window.open(latestUpdate?.installerUrl || 'https://github.com/wazzapr/AfroStudio-AI/actions/workflows/windows-installer.yml', '_blank', 'noopener,noreferrer')
  }
  const filteredDrumSamples = drumSamples.filter(sample => sample.name.toLowerCase().includes(sampleSearch.trim().toLowerCase()))
  const filteredInstruments = SOUND_FONT_INSTRUMENTS.filter(item => (instrumentCategory === 'ALL' || item.category === instrumentCategory) && (item.name + ' ' + item.category).toLowerCase().includes(instrumentSearch.trim().toLowerCase()))
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
        <div className="sidebar-label plugins-label">TOOLS & AI</div><button className={view==='Assistant'?'side-nav active':'side-nav'} onClick={()=>setView('Assistant')}><Bot size={17}/><span>Studio Assistant</span><b className="beta-tag">NEW</b></button><button className={view==='Reference Track'?'side-nav active':'side-nav'} onClick={()=>setView('Reference Track')}><WandSparkles size={17}/><span>Reference Track</span><b className="beta-tag">AI</b></button><button className={view==='Instruments'?'side-nav active':'side-nav'} onClick={()=>setView('Instruments')}><Disc3 size={17}/><span>Instruments</span></button><button className={view==='Effects'?'side-nav active':'side-nav'} onClick={()=>setView('Effects')}><Waves size={17}/><span>Effects</span></button><button className={view==='Updates'?'side-nav active':'side-nav'} onClick={()=>setView('Updates')}><RefreshCw size={17}/><span>Updates</span><b className="beta-tag">NEW</b></button>
        <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17}/></div><strong>Your sound. Your rules.</strong><p>Local-first tools. No mandatory subscriptions.</p><button onClick={()=>setView('Reference Track')}>Explore AI tools <span>↗</span></button></div><button className="help-link" onClick={()=>notify('Shortcuts: Space Play/Stop · Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+S Save · Ctrl+B Duplicate clip · Ctrl+D Duplicate note · F2 Rename selected Playlist clip · Double-click a clip to rename it · Arrow keys move selected Piano Roll note · Shift+Left/Right resize note · Delete selected Piano Roll note · F5 Playlist · F6 Rack · F7 Piano Roll · F9 Mixer')}>? &nbsp; Help & shortcuts</button><div className="version">AFROSTUDIO AI <span>v0.1.0 · EARLY BUILD</span></div></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><i/> YOUR CREATIVE SPACE</div><h1>{view==='Playlist'?'Arrangement':view}</h1><p>{view==='Reference Track'?'Discover the DNA of a track. Create something that feels like you.':'Build your next Afro House record, one layer at a time.'}</p></div><div className="heading-actions"><button className="small-icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Undo2 size={15}/></button><button className="small-icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Redo2 size={15}/></button><button className="secondary-button" onClick={()=>fileInput.current?.click()}><Upload size={15}/> Import audio</button><button className="secondary-button" onClick={async()=>{notify("Rendering Playlist arrangement to WAV…");try{let referenceAudio:AudioBuffer|undefined;if(audioUrl){const response=await fetch(audioUrl);const bytes=await response.arrayBuffer();const decodeContext=new AudioContext();try{referenceAudio=await decodeContext.decodeAudioData(bytes)}finally{await decodeContext.close()}}await exportArrangementWav({bpm,master,steps,notes,clips,channelLevels,referenceAudio,drumSamples:drumSamples.map(sample=>sample.buffer),drumSampleIds:drumSamples.map(sample=>sample.id),rowSampleIds,bars:Math.min(16,Math.max(8,...clips.filter(clip=>clip.lane!==2||Boolean(audioUrl)).map(clip=>Math.ceil((clip.startBar??0)+clip.duration)))),selectedInstrument,mutedChannels});notify("Arrangement WAV exported successfully.")}catch{notify("WAV export failed in this browser.")}}}><Download size={15}/> Export WAV</button><input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg" hidden onChange={e=>importFile(e.target.files?.[0])}/><button className="primary-button" onClick={()=>setView('Reference Track')}><Sparkles size={15}/> AI Assistant</button></div></div>
        {view==='Assistant'&&<section className="panel assistant-panel">
          <div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><Bot size={16}/></div><div><h2>Studio Assistant</h2><p>Give the studio commands and let it perform supported actions</p></div></div><span className="local-tag"><i className="status-dot green"/> LOCAL COMMANDS</span></div>
          <div className="assistant-notice"><Sparkles size={17}/><div><strong>Action-based studio control · first milestone</strong><p>This assistant can directly change tempo, load sampled instruments, toggle built-in effects, create clips, generate editable starting patterns, and open studio pages. It is not yet a connected ChatGPT model and does not claim to understand every free-form request.</p></div></div>
          <div className="assistant-transcript" aria-live="polite">{assistantMessages.map((message,index)=><div key={index} className={'assistant-message '+message.role}><div className="assistant-avatar">{message.role==='assistant'?<Bot size={15}/>:<Music2 size={15}/>}</div><div><span>{message.role==='assistant'?'AFROSTUDIO':'YOU'}</span><p>{message.text}</p></div></div>)}</div>
          <form className="assistant-compose" onSubmit={submitStudioCommand}><textarea aria-label="Studio command" rows={2} value={assistantInput} onChange={event=>setAssistantInput(event.target.value)} placeholder="Example: Set BPM to 120, load trumpet, enable delay…"/><button className="primary-button" type="submit" disabled={!assistantInput.trim()}><Sparkles size={15}/> Run command</button></form>
          <div className="assistant-examples"><span>TRY A COMMAND</span>{['Set BPM to 120','Load trumpet','Enable delay','Make an Afro House idea','Add a bass clip','Open Piano Roll'].map(command=><button key={command} className="secondary-button compact" onClick={()=>runStudioCommand(command)}>{command}</button>)}</div>
        </section>}
        {view==='Updates'&&<section className="panel update-panel">
          <div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><RefreshCw size={16}/></div><div><h2>AfroStudio Updates</h2><p>Check for a newer Windows installer</p></div></div><button className="secondary-button compact" onClick={()=>void checkForUpdates()} disabled={updateCheckState==='checking'}><RefreshCw size={14}/>{updateCheckState==='checking'?'Checking…':'Check for updates'}</button></div>
          <div className="update-content">
            <div className="update-status-card"><div className="update-status-icon"><RefreshCw size={22}/></div><div><strong>{updateCheckState==='checking'?'Checking GitHub…':updateCheckState==='error'?'Could not check updates':updateCheckState==='checked'?'Repository checked':'Keep AfroStudio up to date'}</strong><p>{updateCheckMessage}</p>{lastUpdateCheck&&<small>Last checked: {lastUpdateCheck}</small>}</div></div>
            {latestUpdate&&<div className="update-version-card"><div><span className="update-label">LATEST GITHUB COMMIT</span><strong>{latestUpdate.message}</strong><p>{latestUpdate.sha.slice(0,7)}{latestUpdate.date?' · '+new Date(latestUpdate.date).toLocaleString():''}</p></div><a href={latestUpdate.url} target="_blank" rel="noreferrer">View commit ↗</a></div>}
            <button className="primary-button update-download-button" onClick={downloadLatestUpdate}><Download size={16}/>{latestUpdate?.installerUrl?'Download Windows installer':'Open installer builds'} <span>→</span></button>
            <div className="update-warning"><strong>Updates require one manual step.</strong><p>This page downloads the Windows setup installer when one has been published. Close AfroStudio before running it, follow the installer prompts, and back up important project files first. It does not silently replace files while the app is open.</p></div>
            <div className="update-help"><strong>What the updater checks</strong><ol><li>Checks the latest source commit on GitHub.</li><li>Looks for the published Windows installer.</li><li>Opens the installer download when available, or the build page while a new installer is being built.</li></ol><p>The installer includes the desktop app and local bridge, but not a multi-gigabyte AI model. Full automatic in-app replacement is a separate future milestone.</p></div>
          </div>
        </section>}
        {view==='Playlist'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Layers3 size={16}/></div><div><h2>Playlist</h2><p>Arrange patterns, vocals and audio on the timeline</p></div></div><div className="panel-tools"><span className="tiny-status" title="Automatic project recovery is stored in this browser"><i className={`status-dot ${autosaveStatus === 'saved' ? 'green' : autosaveStatus === 'unavailable' ? 'orange' : ''}`}/>{autosaveStatus === 'loading' ? 'AUTO-SAVE…' : autosaveStatus === 'saving' ? 'SAVING…' : autosaveStatus === 'saved' ? 'AUTO-SAVED' : autosaveStatus === 'unavailable' ? 'AUTO-SAVE UNAVAILABLE' : 'AUTO-SAVE READY'}</span><button className="small-icon-button" title="Add pattern clip" onClick={()=>{const id=Date.now();setClips(old=>[...old,{id,name:'New pattern',duration:4,color:colors[0],lane:0,startBar:0}]);setSelectedClipId(id);notify('New pattern clip added.')}}><Plus size={16}/></button><button className="small-icon-button" title="Duplicate selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={duplicatePattern}><Copy size={15}/></button><button className="small-icon-button" title="Delete selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={()=>{setClips(old=>old.filter(c=>c.id!==selectedClipId));setSelectedClipId(null);notify('Clip deleted.')}}><Trash2 size={15}/></button><button className="small-icon-button" title="Import audio" onClick={()=>fileInput.current?.click()}><FolderOpen size={16}/></button></div></div><div className="timeline-wrap"><div className="timeline-ruler"><div className="track-label-spacer">TRACKS</div><div className="ruler-beats">{Array.from({length:17},(_,i)=><div key={i} className="ruler-number">{i+1}<span/></div>)}</div></div>{['Drums & Percussion','Bass & Groove','Reference / Audio','Melody & Atmosphere'].map((lane,i)=><div className="timeline-row" key={lane}><div className="track-label"><i className="track-color" style={{background:colors[i]}}/><span>{lane}</span><button onClick={()=>notify(lane+' track options')}>···</button></div><div className="timeline-grid" title="Click an empty bar to seek" onClick={e=>{if((e.target as HTMLElement).closest(".audio-clip"))return;const rect=e.currentTarget.getBoundingClientRect();const bar=Math.max(0,Math.min(15,Math.floor(((e.clientX-rect.left)/rect.width)*16)));const nextStep=bar*16;stepRef.current=nextStep;setPlayheadStep(nextStep);if(!playing){nextTickAtRef.current=0;if(audioElement.current)audioElement.current.currentTime=bar*4*60/bpm}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const bar=Math.max(0,Math.min(15,Math.floor(((e.clientX-rect.left)/rect.width)*16)));const file=e.dataTransfer.files?.[0];if(file){importFile(file,bar);return}const id=Number(e.dataTransfer.getData('text/plain'));if(!id)return;setClips(old=>old.map(c=>c.id===id?{...c,lane:i,startBar:bar,duration:Math.max(1,Math.min(c.duration,16-bar))}:c));setSelectedClipId(id);notify('Clip moved to bar '+(bar+1)+'.')}}>{Array.from({length:16},(_,j)=><div key={j} className="grid-beat"/>)}<div className="playhead-line" style={{left:((playheadStep/256)*100)+'%'}} aria-hidden="true"/>{clips.filter(c=>c.lane===i).map(c=><button key={c.id} draggable className="audio-clip" title="Drag to move this clip between bars and tracks" onDragStart={e=>{if(clipResizeRef.current?.id===c.id){e.preventDefault();return}e.dataTransfer.setData('text/plain',String(c.id));e.dataTransfer.effectAllowed='move'}} style={{boxShadow:selectedClipId===c.id?'0 0 0 2px #ffffff':'none',left:((c.startBar??(c.id===3?0:(c.id%3))) * 6.25)+'%',width:Math.min(100-((c.startBar??0)*6.25),Math.max(6.25,Math.ceil(c.duration)*6.25))+'%',background:c.color+'20',borderColor:c.color+'70'}} onClick={()=>{setSelectedClipId(c.id);notify('Selected clip: '+c.name)}} onDoubleClick={e=>{e.stopPropagation();setSelectedClipId(c.id);renameSelectedClip(c.id)}}><span className="clip-wave" style={{color:c.color}}>{Array.from({length:38},(_,k)=><i key={k} style={{height:(18+((k*17+c.id*11)%72))+'%'}}/>)}</span><span className="clip-name">{c.name}</span><span className="clip-resize-handle" role="slider" aria-label={'Resize '+c.name} title="Drag to resize clip by whole bars" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const grid=e.currentTarget.closest('.timeline-grid');if(!grid)return;const startBar=c.startBar??0;clipResizeRef.current={id:c.id,pointerId:e.pointerId,startX:e.clientX,startDuration:Math.min(c.duration,16-startBar),startBar,barWidth:grid.getBoundingClientRect().width/16};setSelectedClipId(c.id)}} onClick={e=>e.stopPropagation()} /></button>)}</div></div>)}</div><div className="timeline-footer"><span><i className="status-dot green"/> 4 tracks</span><span>Snap: Bar <ChevronDown size={12}/></span><span>Zoom <button onClick={()=>notify('Zoom out')}>−</button> <button onClick={()=>notify('Zoom in')}>+</button></span><span className="footer-hint">Space: Play · Ctrl+Z: Undo · Ctrl+S: Save</span></div></section>}
        {view==='Sampler'&&<section className="panel" onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);if(e.dataTransfer.files.length)void importDrumSamples(e.dataTransfer.files)}}><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><FileAudio size={16}/></div><div><h2>Sampler & Sound Library</h2><p>Import or drag samples here · saved locally on this PC</p></div></div><button className="primary-button compact" onClick={()=>sampleInput.current?.click()} disabled={loadingSamples}><Upload size={14}/>{loadingSamples?'Loading…':'Import samples'}</button><input ref={sampleInput} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff" multiple hidden onChange={e=>{if(e.target.files?.length)void importDrumSamples(e.target.files);e.currentTarget.value=''}}/></div><div className="sampler-assignments"><h3>Drum channels</h3><p>Choose a sample for each row. Assigned samples play in the Channel Rack and arrangement, and are included in WAV export.</p>{drumNames.map((name,row)=><div className="sampler-row" key={name} onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);const files=e.dataTransfer.files;if(files.length)void importDrumSamples(files).then(loaded=>{if(loaded[0])assignSampleToRow(loaded[0].id,row)})}}><span className="sampler-color" style={{background:colors[row]}}/><strong>{name}</strong><select aria-label={'Sample for '+name} value={rowSampleIds[row]} onChange={e=>assignSampleToRow(e.target.value,row)}><option value="">Built-in synthesized sound</option>{drumSamples.map(sample=><option key={sample.id} value={sample.id}>{sample.name}</option>)}</select><button className="secondary-button compact" onClick={()=>setView('Channel Rack')}>Open rack</button></div>)}</div><div className="sampler-library"><div className="sampler-library-heading"><h3>My samples <span>{drumSamples.length}</span></h3><input className="sample-search" aria-label="Search samples" placeholder="Search samples…" value={sampleSearch} onChange={e=>setSampleSearch(e.target.value)}/><span>SESSION LIBRARY · LOCAL ONLY</span></div>{drumSamples.length===0?<div className="sampler-empty"><FileAudio size={26}/><strong>Your sample library is empty</strong><p>Import free Afro House drum hits, percussion, loops or textures you have permission to use. WAV is recommended for best compatibility.</p><button className="secondary-button" onClick={()=>sampleInput.current?.click()}><Plus size={14}/> Add first samples</button></div>:filteredDrumSamples.length===0?<div className="sampler-empty"><strong>No matching samples</strong><p>Try a different search term.</p></div>:filteredDrumSamples.map(sample=><div className="sampler-file" key={sample.id}><div className="sampler-file-icon"><AudioWaveform size={17}/></div><div className="sampler-file-info"><strong>{sample.name}</strong><span>{sample.duration.toFixed(2)} sec · decoded locally</span></div><button className="secondary-button compact" onClick={()=>void previewDrumSample(sample)}><Play size={13}/> Preview</button><select aria-label={'Assign '+sample.name} value={rowSampleIds.findIndex(id=>id===sample.id)} onChange={e=>{const row=Number(e.target.value);if(row>=0)assignSampleToRow(sample.id,row)}}><option value={-1}>Assign to…</option>{drumNames.map((name,row)=><option key={name} value={row}>{name}</option>)}</select><button className="small-icon-button" title="Remove sample" onClick={()=>removeDrumSample(sample)}><Trash2 size={14}/></button></div>)}</div><div className="sampler-note"><Check size={15}/> Imported samples are saved in this browser on this PC. Project files remember sample assignments by ID and filename fallback; if you move to another PC, copy the original sample files too. Use sounds you own or have permission to use.</div></section>}
        {view==='Channel Rack'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Drum size={16}/></div><div><h2>Channel Rack</h2><p>Build a 16-step groove · click a step to toggle it</p></div></div><button className="secondary-button compact" onClick={()=>setSteps(rows=>rows.map((_,r)=>Array.from({length:16},(_,i)=>r===0?i%4===0:r===1?i===4||i===12:r===2?i%2===0:i%4===3)))}>Reset pattern</button></div><div className="step-grid"><div className="step-header"><span>CHANNEL</span>{Array.from({length:16},(_,i)=><span key={i} className={i%4===0?'beat-start':''}>{i+1}</span>)}</div>{drumNames.map((name,r)=><div className="step-row" key={name}><button className="channel-name" onClick={()=>{const assigned=drumSamples.find(sample=>sample.id===rowSampleIds[r]);if(assigned)void previewDrumSample(assigned);else void preview([65,180,800,230][r])}}><i style={{background:colors[r]}}/><span>{name}</span><Play size={12}/></button>{steps[r].map((on,i)=><button key={i} aria-label={name+' step '+(i+1)} className={'step '+(on?'on on-'+r:'')+' '+(i%4===0?'beat-start':'')} onClick={()=>setSteps(old=>old.map((row,j)=>j!==r?row:row.map((v,k)=>k===i?!v:v)))}/>)}</div>)}</div><div className="rack-footer"><span>{steps.reduce((n,row)=>n+row.filter(Boolean).length,0)} active steps</span><button className="primary-button" onClick={()=>{setView('Playlist');notify('Pattern ready to arrange.')}}><Plus size={15}/> Add pattern to Playlist</button></div></section>}
        {view==='Piano Roll'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><Music2 size={16}/></div><div><h2>Piano Roll</h2><p>Click to add notes, select notes to edit length and velocity · A minor</p></div></div><div className="piano-edit-controls"><label>Length <select aria-label="Selected note length" disabled={!selectedNote} value={selectedNote?.duration ?? 2} onChange={e=>{const duration=Number(e.target.value);if(selectedNote)setNotes(old=>old.map(note=>note.id===selectedNote.id?{...note,duration}:note))}}>{[1,2,3,4,6,8,12,16].map(length=><option key={length} value={length}>{length} step{length===1?'':'s'}</option>)}</select></label><label>Velocity <input aria-label="Selected note velocity" type="range" min="1" max="127" disabled={!selectedNote} value={selectedNote?.velocity ?? 100} onChange={e=>{const velocity=Number(e.target.value);if(selectedNote)setNotes(old=>old.map(note=>note.id===selectedNote.id?{...note,velocity}:note))}}/><span>{selectedNote?.velocity ?? '—'}</span></label><button className="secondary-button compact" disabled={!selectedNote} onClick={()=>{setNotes(old=>old.filter(note=>note.id!==selectedNoteId));setSelectedNoteId(null)}}><Trash2 size={13}/> Delete note</button><button className="secondary-button compact" onClick={()=>{setNotes([]);setSelectedNoteId(null)}}>Clear notes</button><button className="secondary-button compact" onClick={()=>{exportPianoRollMidi(notes,bpm);notify(`Exported ${notes.length} MIDI notes.`)}}><Download size={13}/> Export MIDI</button></div></div><div className="piano-grid-wrap"><div className="piano-keys">{['B4','A♯4','A4','G♯4','G4','F♯4','F4','E4','D♯4','D4','C♯4','C4'].map((key,i)=><div key={key} className={key.includes('♯')?'black-key':'white-key'}>{key}</div>)}</div><div className="piano-grid" onPointerDown={handlePianoPointerDown} onPointerMove={handlePianoPointerMove} onPointerUp={handlePianoPointerUp} onPointerCancel={handlePianoPointerUp}>{Array.from({length:12},(_,row)=><div className={'piano-row '+([2,4,7,11].includes(row)?'root-row':'')} key={row}>{Array.from({length:16},(_,col)=><button key={col} className={'piano-cell '+(col%4===0?'bar-cell':'')} onClick={()=>{const pitch=11-row;const found=notes.some(n=>n.step===col&&n.pitch===pitch);if(found){const note=notes.find(n=>n.step===col&&n.pitch===pitch);setSelectedNoteId(note?.id ?? null)}else{const id=Date.now();setNotes(old=>[...old,{id,step:col,pitch,duration:2,velocity:100}]);setSelectedNoteId(id)}}}/>)}{notes.filter(n=>n.pitch===11-row).map(n=><button key={n.id} data-note-id={n.id} className={'midi-note '+(selectedNoteId===n.id?'selected':'')} style={{left:(n.step/16*100)+'%',width:(Math.min(16-n.step,n.duration)/16*100)+'%',opacity:0.45+0.55*n.velocity/127}} onClick={()=>setSelectedNoteId(n.id)} title={'Drag to move · drag the right edge to resize · '+n.duration+' steps · velocity '+n.velocity}/>)}</div>)}</div></div><div className="piano-footer"><span>{notes.length} notes</span><span>Snap: 1/4 beat</span><span>Velocity <span className="velocity-bars">{notes.map(n=><i key={n.id} style={{height:(30+(n.pitch*7)%65)+'%'}}/>)}</span></span></div></section>}
        {view==='Mixer'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Mixer</h2><p>Channel levels · mute and gain controls</p></div></div><button className="secondary-button compact" onClick={()=>{setMaster(78);setChannelLevels([78,66,72,55,60]);setMutedChannels([false,false,false,false,false,false])}}>Reset levels</button></div><div className="mixer-channels">{['Master','Kick','Percussion','Bass','Atmosphere','Reference'].map((name,i)=><div className="mixer-channel" key={name}><span className="mixer-number">0{i+1}</span><strong>{name}</strong><div className="meter"><i style={{height:[74,62,48,68,37,53][i]+'%'}}/><i style={{height:[63,53,41,57,29,44][i]+'%'}}/></div><input aria-label={name+' volume'} type="range" min="0" max="100" value={i===0?master:channelLevels[i-1]} onChange={e=>{const value=Number(e.target.value);if(i===0)setMaster(value);else setChannelLevels(old=>old.map((v,j)=>j===i-1?value:v))}}/><span className="db-value">{(20*Math.log10(Math.max(0.001,(i===0?master:channelLevels[i-1])/100))).toFixed(1)} dB</span><button onClick={()=>setMutedChannels(old=>old.map((muted,j)=>j===i?!muted:muted))} className={mutedChannels[i]?'mute-button muted':'mute-button'} aria-pressed={mutedChannels[i]} title={mutedChannels[i]?'Unmute '+name:'Mute '+name}>M</button></div>)}</div><p className="mixer-note"><Volume2 size={14}/> Levels and mute controls affect playback. Separate per-channel effect routing and live signal meters are still planned.</p></section>}
        {view==='Reference Track'&&<section className="panel reference-panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><WandSparkles size={16}/></div><div><h2>AI Reference Track</h2><p>Use musical characteristics as inspiration for something original</p></div></div><b className="beta-tag large">EARLY ACCESS</b></div><div className="reference-drop" onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();importFile(e.dataTransfer.files?.[0])}}><div className="upload-orb"><FileAudio size={25}/></div><h3>{referenceName||'Drop a reference track here'}</h3><p>{referenceName?'Reference loaded. You can replace it with another audio file.':'Drag and drop an audio file, or browse your computer'}</p><span className="file-types">WAV · MP3 · FLAC · M4A</span><button className="secondary-button" onClick={e=>{e.stopPropagation();fileInput.current?.click()}}><Upload size={15}/> Choose audio file</button><button className="secondary-button" disabled={!audioUrl||playing} onClick={e=>{e.stopPropagation();const audio=audioElement.current;if(!audio)return;if(referencePreviewing){audio.pause();setReferencePreviewing(false)}else{audio.currentTime=0;void audioContextRef.current?.resume();void audio.play().then(()=>setReferencePreviewing(true)).catch(()=>notify('Could not preview this audio format in the browser.'))}}}>{referencePreviewing?<Pause size={15}/>:<Play size={15}/>} {referencePreviewing?'Pause preview':'Preview audio'}</button>{audioUrl&&<button className="secondary-button compact" onClick={e=>{e.stopPropagation();clearReference()}}><Trash2 size={14}/> Remove audio</button>}</div>{(analysis.length>0||analyzingReference)&&<div className="analysis-results"><h3><FileAudio size={16}/> Reference analysis</h3>{analyzingReference&&<div><Waves size={14}/> Analysing audio locally on this PC…</div>}{analysis.map(item=><div key={item}><Check size={14}/>{item}</div>)}{detectedBpm&&<button className="secondary-button compact" onClick={()=>{setBpm(detectedBpm);notify('Project tempo set to estimated '+detectedBpm+' BPM.')}}>Use {detectedBpm} BPM in project</button>}</div>}<div className="reference-options"><div className="section-subhead"><div><h3>Shape the direction</h3><p>Choose what matters in your new track</p></div><span className="local-tag"><i className="status-dot green"/> LOCAL-FIRST DESIGN</span></div><label className="prompt-label" htmlFor="ref-prompt">Describe the sound you're aiming for</label><textarea id="ref-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3}/><div className="reference-controls">{[{name:'Groove',value:grooveAmount,onChange:setGrooveAmount},{name:'Style',value:styleInfluence,onChange:setStyleInfluence},{name:'Originality',value:originalityAmount,onChange:setOriginalityAmount}].map(({name,value,onChange})=><label className="range-control" key={name}><span>{name}<strong>{value}%</strong></span><input aria-label={name} type="range" value={value} onChange={e=>onChange(Number(e.target.value))} min="0" max="100"/></label>)}</div><div className="vocal-pitch-control"><label htmlFor="vocal-pitch"><span>Vocal pitch / speed</span><strong>{vocalPitchSemitones > 0 ? '+' : ''}{vocalPitchSemitones} semitones</strong></label><input id="vocal-pitch" aria-label="Vocal pitch and speed" type="range" min="-12" max="12" step="1" value={vocalPitchSemitones} onChange={e=>setVocalPitchSemitones(Number(e.target.value))}/><p>Simple pitch transposition for preview: changing pitch also changes playback speed. This is not yet a studio-quality independent pitch shifter.</p></div><div className="local-ai-connection"><div className="local-ai-title"><div><strong>Local AI engine</strong><p>Optional connection · no paid API</p></div><span className={'ai-connection-status '+localAiStatus}><i className="status-dot"/>{localAiStatus==='online'?'CONNECTED':localAiStatus==='checking'?'CHECKING':localAiStatus==='offline'?'NOT CONNECTED':'NOT SET UP'}</span></div><div className="local-ai-connect-row"><input aria-label="Local AI engine URL" value={localAiUrl} onChange={e=>{setLocalAiUrl(e.target.value);setLocalAiStatus('unchecked');setLocalAiMessage('Connection has not been checked.')}} placeholder="http://127.0.0.1:7860"/><button className="secondary-button compact" onClick={()=>void checkLocalAiEngine()} disabled={localAiStatus==='checking'}>{localAiStatus==='checking'?'Checking…':'Check connection'}</button></div><p className="local-ai-message">{localAiMessage}</p><p className="local-ai-note">ACE-Step integration uses a local API only. Your GTX 750 Ti has 2 GB VRAM, below the recommended 4 GB; generation may fail or be very slow. Choose a 30–180 second render below. Longer renders may be very slow on this PC.</p><label className="duration-control">Audio length <select aria-label="AI audio length" value={generationDuration} onChange={e=>setGenerationDuration(Number(e.target.value))} disabled={aiAudioGenerating}>{[30,60,90,120,180].map(seconds=><option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label><button className="primary-button generate-button" onClick={()=>void generateAiAudio()} disabled={!aceStepAvailable||aiAudioGenerating||!prompt.trim()}><Sparkles size={16}/>{aiAudioGenerating?'Generating AI audio…':'Generate real AI audio (ACE-Step)'} <span>{aiAudioGenerating?'…':'→'}</span></button></div><div className="create-options"><span>GENERATE ELEMENTS</span>{['Drums','Bass','Melody','Chords','Atmosphere'].map((item,i)=><button key={item} className={'element-chip '+(generationElements.includes(item)?'chip-active':'')} aria-pressed={generationElements.includes(item)} onClick={()=>setGenerationElements(old=>old.includes(item)?old.filter(v=>v!==item):[...old,item])}><span>{['◉','≋','♫','◇','☼'][i]}</span>{item}</button>)}</div><button className="primary-button generate-button" onClick={generateAfroHouseIdea}><Sparkles size={16}/> Generate starting idea locally <span>→</span></button><p className="disclaimer">The ACE-Step button above generates a short AI audio file when a compatible local model service is available. This separate button creates editable drum steps and MIDI-style notes procedurally; it does not use a paid API or generate full audio.</p></div></section>}
        {view==='Instruments'&&<section className="panel">
          <div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Disc3 size={16}/></div><div><h2>Instrument Rack</h2><p>Real sampled instruments for the Piano Roll and arrangement</p></div></div><button className="secondary-button compact" onClick={()=>notify('VST3 plugin hosting is planned for a later native audio-engine milestone.')}><Plus size={14}/> Add plugin</button></div>
          <div className="instrument-library-tools"><input className="sample-search" aria-label="Search instruments" placeholder="Search piano, bass, brass, guitar…" value={instrumentSearch} onChange={e=>setInstrumentSearch(e.target.value)}/><select aria-label="Filter instrument category" value={instrumentCategory} onChange={e=>setInstrumentCategory(e.target.value)}><option value="ALL">All categories</option>{Array.from(new Set(SOUND_FONT_INSTRUMENTS.map(item=>item.category))).sort().map(category=><option key={category} value={category}>{category}</option>)}</select><span>{filteredInstruments.length} sampled sounds</span></div>
          <div className="instrument-grid">{[...filteredInstruments.map(item=>({name:item.name,kind:item.category,Icon:item.category==='BASS'?Waves:Music2,color:item.color,hz:440})),...(!instrumentSearch.trim()&&instrumentCategory==='ALL'?[{name:'Deep Kick',kind:'DRUM SYNTH',Icon:Drum,color:'lime',hz:65},{name:'Warm Bass',kind:'SYNTH',Icon:Waves,color:'purple',hz:110},{name:'Soft Keys',kind:'SYNTH KEYS',Icon:Music2,color:'cyan',hz:440},{name:'Air Texture',kind:'SYNTH PAD',Icon:Waves,color:'orange',hz:660}]:[])].map(item=><button className={'instrument-card '+(selectedInstrument===item.name?'instrument-selected':'')} key={item.name} onClick={()=>void selectInstrument(item.name,item.hz)}><div className={'instrument-art '+item.color}><item.Icon size={25}/><span className="art-wave">∿ ∿ ∿</span></div><div className="instrument-meta"><span>{item.kind}</span><strong>{item.name}</strong><small>{selectedInstrument===item.name?'Selected · Piano Roll sound':'Click to load and preview'}</small></div><Play size={16}/></button>)}</div>
          {filteredInstruments.length===0&&instrumentSearch.trim()&&<div className="sampler-empty"><strong>No matching instrument</strong><p>Try a different name or category.</p></div>}
          <p className="mixer-note">Selected sound: <strong>{selectedInstrument}</strong>. {instrumentLoadMessage} The Windows installer bundles 32 starter sample banks locally. The small WebAudioFont playback engine is fetched from its upstream host, so instrument playback needs internet whenever that engine is not already cached; offline playback is not guaranteed.</p>
        </section>}
        {view==='Effects'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Effects Rack</h2><p>Realtime Web Audio effects for instruments and drum playback</p></div></div></div>{['Low-cut EQ','Warm Compressor','Short Echo','Tempo Delay','Studio Reverb','Chorus / Vocal Doubler'].map((name,i)=><div className="effect-row" key={name}><div className="effect-icon"><SlidersHorizontal size={18}/></div><div className="effect-info"><strong>{name}</strong><span>{['Reduce sub-rumble below the main instrument range','Smooth peaks for a more controlled sound','Add a short slapback echo','Add rhythmic echoes synced to the current BPM','Add a generated room tail for more space','Add a subtle modulated layer for width and vocal thickening'][i]}</span></div><span className="effect-tag">{['EQ','DYNAMICS','SPACE','TIME','REVERB','CHORUS'][i]}</span><button className={enabledEffects[i]?'primary-button compact':'secondary-button compact'} aria-pressed={enabledEffects[i]} onClick={()=>{setEnabledEffects(old=>old.map((v,j)=>i===j?!v:v));notify(name+(enabledEffects[i]?' disabled.':' enabled for instrument and drum playback.'))}}>{enabledEffects[i]?'On':'Off'}</button></div>)}<div className="sampler-note"><Check size={15}/> The effect rack processes instrument/drum playback and the imported reference preview. Vocal pitch control is a simple pitch-and-speed change; independent high-quality pitch shifting is still planned.</div></section>}
        <div className="bottom-hint"><div className="hint-icon"><Sparkles size={15}/></div><div><strong>A little idea goes a long way.</strong><span>Start with a groove. Let the feeling lead.</span></div><button onClick={()=>setView('Reference Track')}>Try AI Reference Track <span>→</span></button></div>
      </main>
    </div>
    <footer className="statusbar"><div><i className="status-dot green"/> READY <span>|</span> Preview mode</div><div><span>44.1 kHz</span><span>|</span><span>Project: Untitled</span><span>|</span><span>Local-first</span></div><div><Bot size={12}/> EARLY BUILD</div></footer>
    {toast&&<div className="toast"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>
}

function HeadphonesFallback() { return <Volume2 size={16}/> }
