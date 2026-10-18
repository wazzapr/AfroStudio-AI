import { useEffect, useRef, useState } from 'react'
import { AudioWaveform, Bot, Check, ChevronDown, Copy, Disc3, Download, Drum, FileAudio, FolderOpen, Layers3, Music2, Pause, Play, Plus, Redo2, Save, Settings2, SlidersHorizontal, Sparkles, Square, Trash2, Undo2, Upload, Volume2, Waves, WandSparkles, X } from 'lucide-react'
import { exportArrangementWav } from './audio/exportWav'

type Clip = { id: number; name: string; duration: number; color: string; lane: number; startBar?: number }
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
  const [toast, setToast] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [analysis, setAnalysis] = useState<string[]>([])
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
  const [notes, setNotes] = useState<{id:number;step:number;pitch:number}[]>([
    {id:1,step:0,pitch:5},{id:2,step:3,pitch:3},{id:3,step:6,pitch:4},{id:4,step:10,pitch:2},{id:5,step:13,pitch:4},
  ])
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [playheadStep, setPlayheadStep] = useState(0)
  const audioElement = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const stepRef = useRef(0)
  const playbackStateRef = useRef({ clips, steps, notes, master, channelLevels, mutedChannels, enabledEffects })
  playbackStateRef.current = { clips, steps, notes, master, channelLevels, mutedChannels, enabledEffects }
  type Snapshot = { bpm:number; clips:Clip[]; steps:boolean[][]; notes:{id:number;step:number;pitch:number}[]; master:number; channelLevels:number[] }
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const applyingHistory = useRef(false)
  const lastSnapshot = useRef<Snapshot | null>(null)
  const projectRef = useRef<Snapshot>({ bpm, clips, steps, notes, master, channelLevels })
  const currentSnapshot = () => ({ bpm, clips, steps, notes, master, channelLevels })
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
  }, [bpm, clips, steps, notes, master, channelLevels])
  const applySnapshot = (snapshot: Snapshot) => {
    applyingHistory.current = true
    setBpm(snapshot.bpm); setClips(snapshot.clips); setSteps(snapshot.steps); setNotes(snapshot.notes); setMaster(snapshot.master); setChannelLevels(snapshot.channelLevels)
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
    if (selected.size === 0) { notify('Select at least one element to generate.'); return }
    if (selected.has('Drums')) setSteps([
      Array.from({length:16},(_,i)=>i%4===0),
      Array.from({length:16},(_,i)=>i===4||i===12),
      Array.from({length:16},(_,i)=>i%2===0 || i===11 || i===15),
      Array.from({length:16},(_,i)=>[3,7,11,15].includes(i) && Math.random()>0.22),
    ])
    if (selected.has('Melody') || selected.has('Chords') || selected.has('Atmosphere')) {
      const scale = [0,2,3,5,7,8,10]
      const positions = selected.has('Atmosphere') ? [0,4,8,12] : [0,2,5,7,9,12,14,15]
      const generated: {id:number;step:number;pitch:number}[] = []
      positions.forEach((step,i) => {
        const root = scale[Math.floor(Math.random()*scale.length)]
        if (selected.has('Chords')) [root,(root+3)%12,(root+7)%12].forEach((pitch,j)=>generated.push({id:Date.now()+i*10+j,step,pitch}))
        else if (selected.has('Atmosphere')) [root,Math.min(11,root+4)].forEach((pitch,j)=>generated.push({id:Date.now()+i*10+j,step,pitch}))
        else generated.push({id:Date.now()+i,step,pitch:root})
      })
      setNotes(generated)
    }
    if (selected.has('Bass')) setClips(old=>old.some(c=>c.lane===1)?old: [...old,{id:Date.now()+20,name:'Generated bass groove',duration:8,color:colors[1],lane:1,startBar:0}])
    if (selected.has('Drums')) setClips(old=>old.some(c=>c.lane===0)?old:[...old,{id:Date.now()+21,name:'Generated Afro groove',duration:8,color:colors[0],lane:0,startBar:0}])
    if (selected.has('Melody') || selected.has('Chords')) setClips(old=>old.some(c=>c.lane===3)?old:[...old,{id:Date.now()+22,name:'Generated melody',duration:8,color:colors[3],lane:3,startBar:0}])
    setView('Playlist')
    notify('Created an original Afro House starting idea locally. Refine it in the Channel Rack and Piano Roll.')
  }
  const duplicatePattern = () => {
    setClips(old => [...old, ...old.filter(c => c.lane !== 2).map(c => ({ ...c, id: Date.now() + c.id, name: c.name + ' copy', startBar: Math.min(7, (c.startBar ?? 0) + 1) }))])
    notify('Pattern clips duplicated.')
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
    }
    if (effects[3]) {
      const delay = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain()
      delay.delayTime.value = 60 / bpm / 2; feedback.gain.value = 0.28; wet.gain.value = 0.22
      output.connect(delay); delay.connect(wet).connect(ctx.destination); delay.connect(feedback).connect(delay)
    }
  }
  const triggerDrum = (ctx: AudioContext, row: number) => {
    const { master, channelLevels, mutedChannels } = playbackStateRef.current
    const now = ctx.currentTime, out = ctx.createGain()
    const mixerIndex = row === 0 ? 1 : 2
    const channelLevel = channelLevels[row === 0 ? 0 : 1] ?? 100
    out.gain.value = mutedChannels[0] || mutedChannels[mixerIndex] ? 0 : Math.max(0, Math.min(1, master / 100)) * Math.max(0, Math.min(1, channelLevel / 100)) * 0.8; connectProcessedOutput(ctx, out)
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
  const triggerNote = (ctx: AudioContext, pitch: number, level = 1, channelIndex = 3) => {
    const { master, channelLevels, mutedChannels } = playbackStateRef.current
    const now = ctx.currentTime, osc = ctx.createOscillator(), env = ctx.createGain(), filter = ctx.createBiquadFilter()
    osc.type = 'triangle'; osc.frequency.value = 440 * Math.pow(2, ((60 + pitch) - 69) / 12)
    filter.type = 'lowpass'; filter.frequency.value = 2400
    const channelLevel = channelLevels[channelIndex] ?? 100
    const mixerIndex = channelIndex === 2 ? 3 : 4
    const muted = mutedChannels[0] || mutedChannels[mixerIndex]
    env.gain.setValueAtTime(0.0001, now); env.gain.exponentialRampToValueAtTime((muted ? 0 : 0.14 * master / 100 * Math.max(0, Math.min(1, channelLevel / 100)) * level), now + 0.025); env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    osc.connect(filter).connect(env); connectProcessedOutput(ctx, env); osc.start(now); osc.stop(now + 0.23)
  }
  const clipActiveAt = (lane: number, bar: number) => playbackStateRef.current.clips.some(c => c.lane === lane && bar >= (c.startBar ?? 0) && bar < (c.startBar ?? 0) + Math.max(1, Math.ceil(c.duration)))
  useEffect(() => {
    if (!playing) return
    const ctx = audioContextRef.current || new window.AudioContext()
    if (!audioContextRef.current) {
      audioContextRef.current = ctx
      setAudioContext(ctx)
    }
    void ctx.resume()
    const tick = () => {
      const position = stepRef.current
      const bar = Math.floor(position / 16)
      const step = position % 16
      const current = playbackStateRef.current
      if (clipActiveAt(0, bar)) current.steps.forEach((row, rowIndex) => { if (row[step]) triggerDrum(ctx, rowIndex) })
      if (clipActiveAt(1, bar) && [0, 6, 8, 14].includes(step)) triggerNote(ctx, step % 8 === 0 ? 0 : 3, 0.72, 2)
      if (clipActiveAt(3, bar)) current.notes.filter(note => note.step === step).forEach(note => triggerNote(ctx, note.pitch))
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
      if (position >= 127) {
        stepRef.current = 0
        setPlayheadStep(0)
        setPlaying(false)
        if (audio && !audio.paused) audio.pause()
      } else {
        stepRef.current = position + 1
      }
    }
    tick()
    const timer = window.setInterval(tick, 60000 / bpm / 4)
    return () => window.clearInterval(timer)
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); duplicatePattern(); return }
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
  const importFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|ogg|m4a|aiff?)$/i.test(file.name)) { notify('Choose an audio file such as WAV, MP3, FLAC or M4A.'); return }
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 30
      setReferenceName(file.name)
      setAudioUrl(url); audioElement.current = audio
      setClips(old => [...old.filter(c => !(c.lane === 2 && c.name === 'Reference · drop a song')), { id: Date.now(), name: file.name, duration: Math.max(1, Math.min(64, duration / (4 * 60 / bpm))), color: colors[2], lane: 2, startBar: 0 }])
      setAnalysis(['Audio loaded · ' + Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0'), 'File metadata is available. BPM, key and stem analysis need a model integration.', 'Reference workflow is ready for the next development milestone.'])
      notify('Reference imported into the Playlist.')
    }
    audio.onerror = () => { setReferenceName(file.name); setAnalysis(['File selected: ' + file.name, 'Could not read duration in the browser.']); setAudioUrl(url); audioElement.current = audio }
    audio.load()
  }
  const saveProject = () => {
    const data = { app: 'AfroStudio AI', version: '0.1.0', bpm, clips, steps, notes, referenceName, master, channelLevels, prompt }
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
          typeof item.color === 'string' && typeof item.lane === 'number' && item.lane >= 0 && item.lane <= 3 && (item.startBar === undefined || (typeof item.startBar === 'number' && item.startBar >= 0 && item.startBar <= 7))
      })
      const validNotes = data.notes.every((note: unknown) => {
        if (!note || typeof note !== 'object') return false
        const item = note as Record<string, unknown>
        return typeof item.id === 'number' && typeof item.step === 'number' && item.step >= 0 && item.step < 16 &&
          typeof item.pitch === 'number' && item.pitch >= 0 && item.pitch < 12
      })
      if (!validSteps || !validClips || !validNotes) throw new Error('Project data is incomplete or damaged.')
      setPlaying(false)
      audioElement.current?.pause()
      setAudioUrl('')
      setReferenceName(typeof data.referenceName === 'string' ? data.referenceName : '')
      setBpm(Math.max(40, Math.min(240, data.bpm)))
      setClips(data.clips as Clip[])
      setSteps(data.steps as boolean[][])
      setNotes(data.notes as {id:number;step:number;pitch:number}[])
      setMutedChannels([false,false,false,false,false,false])
      setMaster(typeof data.master === 'number' ? Math.max(0, Math.min(100, data.master)) : 78)
      setChannelLevels(Array.isArray(data.channelLevels) && data.channelLevels.length === 5 && data.channelLevels.every(v => typeof v === 'number') ? data.channelLevels.map(v => Math.max(0, Math.min(100, v as number))) : [78, 66, 72, 55, 60])
      if (typeof data.prompt === 'string') setPrompt(data.prompt)
      stepRef.current = 0
      setPlayheadStep(0)
      notify('Project loaded. Re-import its reference audio if needed.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open this project file.')
    }
  }
  const nav = [{ name: 'Playlist', Icon: Layers3 }, { name: 'Piano Roll', Icon: Music2 }, { name: 'Channel Rack', Icon: Drum }, { name: 'Mixer', Icon: SlidersHorizontal }]

  return <div className="app-shell" onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files?.[0]) }}>
    {dragging && <div className="drop-overlay"><div className="drop-message"><Upload size={34}/><h2>Drop audio into AfroStudio</h2><p>It will be added to your Playlist.</p></div></div>}
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioWaveform size={23}/></div><div><div className="brand-name">AfroStudio <span>AI</span></div><div className="brand-sub">MAKE YOUR OWN RHYTHM</div></div></div>
      <nav className="top-menu"><button className="menu-link selected" onClick={() => setView('Playlist')}>Studio</button><button className="menu-link" onClick={() => setView('Reference Track')}>AI Lab <i className="new-dot"/></button><button className="menu-link" onClick={() => setView('Instruments')}>Sound Library</button></nav>
      <div className="top-actions"><div className="project-name"><i className="status-dot"/> Untitled Project <ChevronDown size={14}/></div><button className="icon-button" onClick={() => notify('Audio uses your browser output. Master volume controls generated sounds.')}><Settings2 size={17}/></button><button className="secondary-button" onClick={() => projectInput.current?.click()}><FolderOpen size={15}/> Open project</button><input ref={projectInput} type="file" accept="application/json,.json" hidden onChange={e=>{void loadProject(e.target.files?.[0]);e.currentTarget.value=''}}/><button className="save-button" onClick={saveProject}><Save size={15}/> Save project</button></div>
    </header>
    <div className="transport">
      <div className="transport-left"><button className="transport-icon" onClick={() => {setPlaying(false);stepRef.current=0;setPlayheadStep(0);notify('Playback stopped.')}} title="Stop"><Square size={13} fill="currentColor"/></button><button className="play-button" onClick={() => setPlaying(v => !v)} title="Play or pause">{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button className="transport-icon" onClick={() => {stepRef.current=0;setPlayheadStep(0);notify('Returned to start.')}}><span>↶</span></button><div className="transport-divider"/><div className="bpm-control"><span>BPM</span><input aria-label="Tempo BPM" type="number" min="40" max="240" value={bpm} onChange={e=>setBpm(Math.max(40,Math.min(240,Number(e.target.value)||122)))}/><div className="bpm-nudge"><button onClick={()=>setBpm(v=>Math.min(240,v+1))}>⌃</button><button onClick={()=>setBpm(v=>Math.max(40,v-1))}>⌄</button></div></div><div className="key-pill"><span>KEY</span><strong>A min</strong><ChevronDown size={12}/></div><div className="time-readout">{(()=>{const seconds=Math.floor(playheadStep*(60/bpm/4));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')})()}</div></div>
      <div className="transport-center"><span className="status-dot green"/> Audio engine <span className="status-label">{playing ? "Playing arrangement" : "Ready"}</span></div>
      <div className="transport-right"><HeadphonesFallback/><span>MASTER</span><input aria-label="Master volume" type="range" min="0" max="100" value={master} onChange={e=>setMaster(Number(e.target.value))}/><span className="volume-value">{master}%</span></div>
    </div>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-label">WORKSPACE</div>{nav.map(({name,Icon})=><button key={name} className={view===name?'side-nav active':'side-nav'} onClick={()=>setView(name)}><Icon size={17}/><span>{name}</span>{name==='Playlist'&&<small>F5</small>}</button>)}
        <div className="sidebar-label plugins-label">TOOLS & AI</div><button className={view==='Reference Track'?'side-nav active':'side-nav'} onClick={()=>setView('Reference Track')}><WandSparkles size={17}/><span>Reference Track</span><b className="beta-tag">AI</b></button><button className={view==='Instruments'?'side-nav active':'side-nav'} onClick={()=>setView('Instruments')}><Disc3 size={17}/><span>Instruments</span></button><button className={view==='Effects'?'side-nav active':'side-nav'} onClick={()=>setView('Effects')}><Waves size={17}/><span>Effects</span></button>
        <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17}/></div><strong>Your sound. Your rules.</strong><p>Local-first tools. No mandatory subscriptions.</p><button onClick={()=>setView('Reference Track')}>Explore AI tools <span>↗</span></button></div><button className="help-link" onClick={()=>notify('Shortcuts: Space Play/Stop · Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+S Save · Ctrl+B Duplicate · F5 Playlist · F6 Rack · F7 Piano Roll · F9 Mixer')}>? &nbsp; Help & shortcuts</button><div className="version">AFROSTUDIO AI <span>v0.1.0 · EARLY BUILD</span></div></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><i/> YOUR CREATIVE SPACE</div><h1>{view==='Playlist'?'Arrangement':view}</h1><p>{view==='Reference Track'?'Discover the DNA of a track. Create something that feels like you.':'Build your next Afro House record, one layer at a time.'}</p></div><div className="heading-actions"><button className="small-icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Undo2 size={15}/></button><button className="small-icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Redo2 size={15}/></button><button className="secondary-button" onClick={()=>fileInput.current?.click()}><Upload size={15}/> Import audio</button><button className="secondary-button" onClick={async()=>{notify("Rendering Playlist arrangement to WAV…");try{let referenceAudio:AudioBuffer|undefined;if(audioUrl){const response=await fetch(audioUrl);const bytes=await response.arrayBuffer();const decodeContext=new AudioContext();try{referenceAudio=await decodeContext.decodeAudioData(bytes)}finally{await decodeContext.close()}}await exportArrangementWav({bpm,master,steps,notes,clips,channelLevels,referenceAudio,bars:8});notify("Arrangement WAV exported successfully.")}catch{notify("WAV export failed in this browser.")}}}><Download size={15}/> Export WAV</button><input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg" hidden onChange={e=>importFile(e.target.files?.[0])}/><button className="primary-button" onClick={()=>setView('Reference Track')}><Sparkles size={15}/> AI Assistant</button></div></div>
        {view==='Playlist'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Layers3 size={16}/></div><div><h2>Playlist</h2><p>Arrange patterns, vocals and audio on the timeline</p></div></div><div className="panel-tools"><span className="tiny-status"><i className="status-dot green"/> AUTO-SAVE READY</span><button className="small-icon-button" title="Add pattern clip" onClick={()=>{const id=Date.now();setClips(old=>[...old,{id,name:'New pattern',duration:4,color:colors[0],lane:0,startBar:0}]);setSelectedClipId(id);notify('New pattern clip added.')}}><Plus size={16}/></button><button className="small-icon-button" title="Duplicate selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={()=>{const clip=clips.find(c=>c.id===selectedClipId);if(!clip)return;const id=Date.now();setClips(old=>[...old,{...clip,id,name:clip.name+' copy',startBar:Math.min(7,(clip.startBar??0)+Math.max(1,Math.ceil(clip.duration)))}]);setSelectedClipId(id);notify('Clip duplicated.')}}><Copy size={15}/></button><button className="small-icon-button" title="Delete selected clip" disabled={!clips.some(c=>c.id===selectedClipId)} onClick={()=>{setClips(old=>old.filter(c=>c.id!==selectedClipId));setSelectedClipId(null);notify('Clip deleted.')}}><Trash2 size={15}/></button><button className="small-icon-button" title="Import audio" onClick={()=>fileInput.current?.click()}><FolderOpen size={16}/></button></div></div><div className="timeline-wrap"><div className="timeline-ruler"><div className="track-label-spacer">TRACKS</div><div className="ruler-beats">{Array.from({length:9},(_,i)=><div key={i} className="ruler-number">{i+1}<span/></div>)}</div></div>{['Drums & Percussion','Bass & Groove','Reference / Audio','Melody & Atmosphere'].map((lane,i)=><div className="timeline-row" key={lane}><div className="track-label"><i className="track-color" style={{background:colors[i]}}/><span>{lane}</span><button onClick={()=>notify(lane+' track options')}>···</button></div><div className="timeline-grid" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files?.[0];if(file){importFile(file);return}const id=Number(e.dataTransfer.getData('text/plain'));if(!id)return;const rect=e.currentTarget.getBoundingClientRect();const bar=Math.max(0,Math.min(7,Math.floor(((e.clientX-rect.left)/rect.width)*8)));setClips(old=>old.map(c=>c.id===id?{...c,lane:i,startBar:bar}:c));setSelectedClipId(id);notify('Clip moved to bar '+(bar+1)+'.')}}>{Array.from({length:8},(_,j)=><div key={j} className="grid-beat"/>)}<div className="playhead-line" style={{left:((playheadStep/128)*100)+'%'}} aria-hidden="true"/>{clips.filter(c=>c.lane===i).map(c=><button key={c.id} draggable className="audio-clip" title="Drag to move this clip between bars and tracks" onDragStart={e=>{e.dataTransfer.setData('text/plain',String(c.id));e.dataTransfer.effectAllowed='move'}} style={{boxShadow:selectedClipId===c.id?'0 0 0 2px #ffffff':'none',left:((c.startBar??(c.id===3?0:(c.id%3))) * 12.5)+'%',width:Math.min(100-((c.startBar??0)*12.5),Math.max(12.5,Math.ceil(c.duration)*12.5))+'%',background:c.color+'20',borderColor:c.color+'70'}} onClick={()=>{setSelectedClipId(c.id);notify('Selected clip: '+c.name)}}><span className="clip-wave" style={{color:c.color}}>{Array.from({length:38},(_,k)=><i key={k} style={{height:(18+((k*17+c.id*11)%72))+'%'}}/>)}</span><span className="clip-name">{c.name}</span></button>)}</div></div>)}</div><div className="timeline-footer"><span><i className="status-dot green"/> 4 tracks</span><span>Snap: Bar <ChevronDown size={12}/></span><span>Zoom <button onClick={()=>notify('Zoom out')}>−</button> <button onClick={()=>notify('Zoom in')}>+</button></span><span className="footer-hint">Space: Play · Ctrl+Z: Undo · Ctrl+S: Save</span></div></section>}
        {view==='Channel Rack'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Drum size={16}/></div><div><h2>Channel Rack</h2><p>Build a 16-step groove · click a step to toggle it</p></div></div><button className="secondary-button compact" onClick={()=>setSteps(rows=>rows.map((_,r)=>Array.from({length:16},(_,i)=>r===0?i%4===0:r===1?i===4||i===12:r===2?i%2===0:i%4===3)))}>Reset pattern</button></div><div className="step-grid"><div className="step-header"><span>CHANNEL</span>{Array.from({length:16},(_,i)=><span key={i} className={i%4===0?'beat-start':''}>{i+1}</span>)}</div>{drumNames.map((name,r)=><div className="step-row" key={name}><button className="channel-name" onClick={()=>void preview([65,180,800,230][r])}><i style={{background:colors[r]}}/><span>{name}</span><Play size={12}/></button>{steps[r].map((on,i)=><button key={i} aria-label={name+' step '+(i+1)} className={'step '+(on?'on on-'+r:'')+' '+(i%4===0?'beat-start':'')} onClick={()=>setSteps(old=>old.map((row,j)=>j!==r?row:row.map((v,k)=>k===i?!v:v)))}/>)}</div>)}</div><div className="rack-footer"><span>{steps.reduce((n,row)=>n+row.filter(Boolean).length,0)} active steps</span><button className="primary-button" onClick={()=>{setView('Playlist');notify('Pattern ready to arrange.')}}><Plus size={15}/> Add pattern to Playlist</button></div></section>}
        {view==='Piano Roll'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><Music2 size={16}/></div><div><h2>Piano Roll</h2><p>Click the grid to add or remove notes · A minor</p></div></div><button className="secondary-button compact" onClick={()=>setNotes([])}>Clear notes</button></div><div className="piano-grid-wrap"><div className="piano-keys">{['C5','B4','A♯4','A4','G4','F♯4','F4','E4','D♯4','D4','C♯4','C4'].map((key,i)=><div key={key} className={key.includes('♯')?'black-key':'white-key'}>{key}</div>)}</div><div className="piano-grid">{Array.from({length:12},(_,row)=><div className={'piano-row '+([0,3,7,10].includes(row)?'root-row':'')} key={row}>{Array.from({length:16},(_,col)=><button key={col} className={'piano-cell '+(col%4===0?'bar-cell':'')} onClick={()=>{const pitch=11-row;const found=notes.some(n=>n.step===col&&n.pitch===pitch);setNotes(old=>found?old.filter(n=>!(n.step===col&&n.pitch===pitch)):[...old,{id:Date.now(),step:col,pitch}])}}/>)}{notes.filter(n=>n.pitch===11-row).map(n=><button key={n.id} className="midi-note" style={{left:(n.step/16*100)+'%'}} onClick={()=>setNotes(old=>old.filter(x=>x.id!==n.id))} title="Click to remove note"/>)}</div>)}</div></div><div className="piano-footer"><span>{notes.length} notes</span><span>Snap: 1/4 beat</span><span>Velocity <span className="velocity-bars">{notes.map(n=><i key={n.id} style={{height:(30+(n.pitch*7)%65)+'%'}}/>)}</span></span></div></section>}
        {view==='Mixer'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Mixer</h2><p>Channel levels · preview controls</p></div></div><button className="secondary-button compact" onClick={()=>{setMaster(78);setChannelLevels([78,66,72,55,60]);setMutedChannels([false,false,false,false,false,false])}}>Reset levels</button></div><div className="mixer-channels">{['Master','Kick','Percussion','Bass','Atmosphere','Reference'].map((name,i)=><div className="mixer-channel" key={name}><span className="mixer-number">0{i+1}</span><strong>{name}</strong><div className="meter"><i style={{height:[74,62,48,68,37,53][i]+'%'}}/><i style={{height:[63,53,41,57,29,44][i]+'%'}}/></div><input aria-label={name+' volume'} type="range" min="0" max="100" value={i===0?master:channelLevels[i-1]} onChange={e=>{const value=Number(e.target.value);if(i===0)setMaster(value);else setChannelLevels(old=>old.map((v,j)=>j===i-1?value:v))}}/><span className="db-value">{(20*Math.log10(Math.max(0.001,(i===0?master:channelLevels[i-1])/100))).toFixed(1)} dB</span><button onClick={()=>setMutedChannels(old=>old.map((muted,j)=>j===i?!muted:muted))} className={mutedChannels[i]?'mute-button muted':'mute-button'} aria-pressed={mutedChannels[i]} title={mutedChannels[i]?'Unmute '+name:'Mute '+name}>M</button></div>)}</div><p className="mixer-note"><Volume2 size={14}/> Full channel routing and effects need the dedicated audio engine.</p></section>}
        {view==='Reference Track'&&<section className="panel reference-panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon purple"><WandSparkles size={16}/></div><div><h2>AI Reference Track</h2><p>Use musical characteristics as inspiration for something original</p></div></div><b className="beta-tag large">EARLY ACCESS</b></div><div className="reference-drop" onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();importFile(e.dataTransfer.files?.[0])}}><div className="upload-orb"><FileAudio size={25}/></div><h3>{referenceName||'Drop a reference track here'}</h3><p>{referenceName?'Reference loaded. You can replace it with another audio file.':'Drag and drop an audio file, or browse your computer'}</p><span className="file-types">WAV · MP3 · FLAC · M4A</span><button className="secondary-button" onClick={e=>{e.stopPropagation();fileInput.current?.click()}}><Upload size={15}/> Choose audio file</button></div>{analysis.length>0&&<div className="analysis-results"><h3><FileAudio size={16}/> Import status</h3>{analysis.map(item=><div key={item}><Check size={14}/>{item}</div>)}</div>}<div className="reference-options"><div className="section-subhead"><div><h3>Shape the direction</h3><p>Choose what matters in your new track</p></div><span className="local-tag"><i className="status-dot green"/> LOCAL-FIRST DESIGN</span></div><label className="prompt-label" htmlFor="ref-prompt">Describe the sound you're aiming for</label><textarea id="ref-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3}/><div className="reference-controls">{[['Groove',80],['Style',55],['Originality',85]].map(([name,val])=><label className="range-control" key={String(name)}><span>{name}<strong>{val}%</strong></span><input aria-label={String(name)} type="range" defaultValue={Number(val)} min="0" max="100"/></label>)}</div><div className="create-options"><span>GENERATE ELEMENTS</span>{['Drums','Bass','Melody','Chords','Atmosphere'].map((item,i)=><button key={item} className={'element-chip '+(generationElements.includes(item)?'chip-active':'')} aria-pressed={generationElements.includes(item)} onClick={()=>setGenerationElements(old=>old.includes(item)?old.filter(v=>v!==item):[...old,item])}><span>{['◉','≋','♫','◇','☼'][i]}</span>{item}</button>)}</div><button className="primary-button generate-button" onClick={generateAfroHouseIdea}><Sparkles size={16}/> Generate starting idea locally <span>→</span></button><p className="disclaimer">This creates editable drum steps and MIDI-style notes locally—no paid API. It is a procedural starting point, not AI audio generation or stem separation. Reference audio remains a separate track.</p></div></section>}
        {view==='Instruments'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon lime"><Disc3 size={16}/></div><div><h2>Instruments</h2><p>Starter sound previews and future plugin slots</p></div></div><button className="secondary-button compact" onClick={()=>notify('VST3 hosting is planned for a later audio-engine milestone.')}><Plus size={14}/> Add plugin</button></div><div className="instrument-grid">{[{name:'Deep Kick',kind:'DRUM SYNTH',Icon:Drum,color:'lime',hz:65},{name:'Warm Bass',kind:'SYNTH',Icon:Waves,color:'purple',hz:110},{name:'Soft Keys',kind:'KEYS',Icon:Music2,color:'cyan',hz:440},{name:'Air Texture',kind:'ATMOSPHERE',Icon:Waves,color:'orange',hz:660}].map(item=><button className="instrument-card" key={item.name} onClick={()=>void preview(item.hz)}><div className={'instrument-art '+item.color}><item.Icon size={25}/><span className="art-wave">∿ ∿ ∿</span></div><div className="instrument-meta"><span>{item.kind}</span><strong>{item.name}</strong><small>Preview tone · v0.1</small></div><Play size={16}/></button>)}</div><p className="mixer-note">Preview tones only; full samplers, synths and VST3 hosting are planned.</p></section>}
        {view==='Effects'&&<section className="panel"><div className="panel-heading"><div className="panel-title"><div className="panel-icon cyan"><SlidersHorizontal size={16}/></div><div><h2>Effects</h2><p>Planned processing chain</p></div></div></div>{['Low-cut EQ','Warm Compressor','Short Reverb','Tempo Delay'].map((name,i)=><div className="effect-row" key={name}><div className="effect-icon"><SlidersHorizontal size={18}/></div><div className="effect-info"><strong>{name}</strong><span>{['Remove subsonic rumble from the signal','Control peaks and add gentle glue','Add a short, subtle room-like echo','Create rhythmic echoes synced to BPM'][i]}</span></div><span className="effect-tag">{['EQ','DYNAMICS','SPACE','TIME'][i]}</span><button className={enabledEffects[i]?'primary-button compact':'secondary-button compact'} aria-pressed={enabledEffects[i]} onClick={()=>{setEnabledEffects(old=>old.map((v,j)=>i===j?!v:v));notify(name+(enabledEffects[i]?' disabled.':' enabled.'))}}>{enabledEffects[i]?'On':'Off'}</button></div>)}</section>}
        <div className="bottom-hint"><div className="hint-icon"><Sparkles size={15}/></div><div><strong>A little idea goes a long way.</strong><span>Start with a groove. Let the feeling lead.</span></div><button onClick={()=>setView('Reference Track')}>Try AI Reference Track <span>→</span></button></div>
      </main>
    </div>
    <footer className="statusbar"><div><i className="status-dot green"/> READY <span>|</span> Preview mode</div><div><span>44.1 kHz</span><span>|</span><span>Project: Untitled</span><span>|</span><span>Local-first</span></div><div><Bot size={12}/> EARLY BUILD</div></footer>
    {toast&&<div className="toast"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>
}

function HeadphonesFallback() { return <Volume2 size={16}/> }
