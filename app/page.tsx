'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

type Source = 'mouse' | 'keyboard' | 'midi' | 'replay'
type EventType = 'note_on' | 'note_off'
type NoteEvent = { type: EventType; note: string; velocity: number; source: Source; time_ms: number }
type Sequence = { id: string; title: string; created_at: string; duration_ms: number; events: NoteEvent[] }
type Voice = { oscillator: OscillatorNode; gain: GainNode }
type Particle = { x: number; y: number; width: number; hue: number; born: number; life: number }
type MidiInputLike = { onmidimessage: ((event: { data: Uint8Array }) => void) | null }
type MidiAccessLike = { inputs: Map<string, MidiInputLike> }
type SupabaseClientLike = { from: (table: string) => any }
type Account = { id: string; name: string; email: string; password: string; history: Sequence[]; xp: number; streak: number; joined_at: string; guest?: boolean }
type SoundName = 'Concert Grand' | 'Electric Piano' | 'Organ' | 'Harpsichord'
type LessonStep = { note: string; time: number }
type Piece = { id: string; title: string; composer: string; difficulty: 'Beginner' | 'Easy' | 'Intermediate' | 'Advanced'; steps: LessonStep[] }
type LessonResult = { correct: number; total: number; averageLatency: number; lateNotes: number; wrongNotes: number }

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const WHITE_NAMES = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
const ALL_NOTES = Array.from({ length: 48 }, (_, index) => midiToNote(48 + index))
const WHITE_NOTES = ALL_NOTES.filter((note) => !note.includes('#'))
const BLACK_NOTES = ALL_NOTES.filter((note) => note.includes('#'))
const KEYBOARD_MAP: Record<string, string> = {
  a: 'C4', w: 'C#4', s: 'D4', e: 'D#4', d: 'E4', f: 'F4', t: 'F#4',
  g: 'G4', y: 'G#4', h: 'A4', u: 'A#4', j: 'B4', k: 'C5',
}

const PIECES: Piece[] = [
  { id: 'ode', title: 'Ode to Joy', composer: 'L. van Beethoven', difficulty: 'Beginner', steps: ['E4','E4','F4','G4','G4','F4','E4','D4','C4','C4','D4','E4','E4','D4','D4'].map((note, index) => ({ note, time: index * 650 })) },
  { id: 'fur-elise', title: 'Für Elise · opening', composer: 'L. van Beethoven', difficulty: 'Easy', steps: ['E5','D#5','E5','D#5','E5','B4','D5','C5','A4'].map((note, index) => ({ note, time: index * 500 })) },
  { id: 'minuet', title: 'Minuet in G', composer: 'J. S. Bach', difficulty: 'Intermediate', steps: ['D5','G4','A4','B4','C5','D5','D5','D5','E5','C5','E5','D5'].map((note, index) => ({ note, time: index * 520 })) },
  { id: 'twinkle', title: 'Twinkle Twinkle Little Star', composer: 'Traditional', difficulty: 'Beginner', steps: ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4','G4','G4','F4','F4','E4','E4','D4'].map((note, index) => ({ note, time: index * 560 })) },
  { id: 'moonlight', title: 'Moonlight Sonata · motif', composer: 'L. van Beethoven', difficulty: 'Intermediate', steps: ['C#4','E4','G#4','C#5','E4','G#4','C#5','E4','G#4','C#5','E4','G#4','B3','D#4','F#4','B4','D#4','F#4','B4'].map((note, index) => ({ note, time: index * 620 })) },
  { id: 'prelude', title: 'Prelude in C · pattern', composer: 'J. S. Bach', difficulty: 'Advanced', steps: ['C4','E4','G4','C5','E5','G4','C5','E5','D4','F4','A4','D5','F5','A4','D5','F5','G3','D4','G4','B4','D5','G4','B4','D5'].map((note, index) => ({ note, time: index * 480 })) },
]

function createDemoHistory(): Sequence[] {
  return Array.from({ length: 6 }, (_, index) => {
    const created = new Date(); created.setDate(created.getDate() - index)
    const melody = ['C4', 'E4', 'G4', 'E4', 'D4', 'F4', 'A4', 'F4']
    const events = melody.flatMap((note, noteIndex) => [{ type: 'note_on' as const, note, velocity: 96, source: 'keyboard' as const, time_ms: noteIndex * 500 }, { type: 'note_off' as const, note, velocity: 0, source: 'keyboard' as const, time_ms: noteIndex * 500 + 360 }])
    return { id: `demo-sequence-${index}`, title: `Warm-up ${index + 1}`, created_at: created.toISOString(), duration_ms: 240000, events }
  })
}

function midiToNote(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

function noteToFrequency(note: string) {
  const match = note.match(/^([A-G]#?)(-?\d+)$/)
  if (!match) return 440
  const semitone = NOTE_NAMES.indexOf(match[1]) + (Number(match[2]) + 1) * 12
  return 440 * 2 ** ((semitone - 69) / 12)
}

function isWhite(note: string) {
  return WHITE_NAMES.has(note[0]) && !note.includes('#')
}

function noteKeyPosition(note: string) {
  const match = note.match(/^([A-G]#?)(-?\d+)$/)
  if (!match) return { left: '0%', width: '0%' }
  const midi = NOTE_NAMES.indexOf(match[1]) + (Number(match[2]) + 1) * 12
  const whiteBefore = ALL_NOTES.slice(0, midi - 48).filter(isWhite).length
  if (note.includes('#')) return { left: `calc(${(whiteBefore / WHITE_NOTES.length) * 100}% - 1.15%)`, width: '2.3%' }
  return { left: `${(whiteBefore / WHITE_NOTES.length) * 100}%`, width: `${100 / WHITE_NOTES.length}%` }
}

const GUEST_ACCOUNT: Account = { id: 'guest', name: 'Guest player', email: '', password: '', history: [], xp: 0, streak: 0, joined_at: 'guest', guest: true }

export default function PianoTutorApp({ initialPath = '/' }: { initialPath?: string }) {
  const [account, setAccount] = useState<Account | null>(() => initialPath === '/practice' ? GUEST_ACCOUNT : null)
  const [path, setPath] = useState(initialPath)
  const guestHistoryRef = useRef<Sequence[]>([])

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }, [])

  useEffect(() => {
    setPath(window.location.pathname)
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const savedId = localStorage.getItem('piano-tutor-current-account')
    const accounts: Account[] = JSON.parse(localStorage.getItem('piano-tutor-accounts') ?? '[]')
    if (!accounts.some((item) => item.email === '0aertmansaku@gmail.com')) {
      accounts.push({ id: 'demo-level-three', name: 'Aert', email: '0aertmansaku@gmail.com', password: 'Aert123456', history: createDemoHistory(), xp: 250, streak: 6, joined_at: new Date().toISOString() })
      localStorage.setItem('piano-tutor-accounts', JSON.stringify(accounts))
    }
    const saved = accounts.find((item) => item.id === savedId)
    if (saved) setAccount(saved)
    else if (window.location.pathname === '/practice') setAccount(GUEST_ACCOUNT)
  }, [])

  const saveAccount = useCallback((next: Account) => {
    const resolved = !next.guest && guestHistoryRef.current.length
      ? { ...next, history: [...next.history, ...guestHistoryRef.current], xp: next.xp + guestHistoryRef.current.length * 25 }
      : next
    if (!next.guest) guestHistoryRef.current = []
    setAccount(resolved)
    if (resolved.guest) return
    const accounts: Account[] = JSON.parse(localStorage.getItem('piano-tutor-accounts') ?? '[]')
    const index = accounts.findIndex((item) => item.id === resolved.id)
    if (index >= 0) accounts[index] = resolved
    else accounts.push(resolved)
    localStorage.setItem('piano-tutor-accounts', JSON.stringify(accounts))
    localStorage.setItem('piano-tutor-current-account', resolved.id)
  }, [])

  const signOut = () => { if (account?.guest) guestHistoryRef.current = account.history; localStorage.removeItem('piano-tutor-current-account'); setAccount(null); navigate('/login') }
  const beginMidiSetup = (next: Account) => { saveAccount(next); navigate('/midi-setup') }
  if (!account && path === '/') return <LandingPage onNavigate={navigate} />
  if (!account) return <AuthScreen registering={path === '/signup'} onNavigate={navigate} onAuthenticated={beginMidiSetup} onTryGuest={() => beginMidiSetup({ id: 'guest', name: 'Guest player', email: '', password: '', history: guestHistoryRef.current, xp: guestHistoryRef.current.length * 25, streak: 0, joined_at: new Date().toISOString(), guest: true })} />
  if (path === '/midi-setup') return <MidiSetupScreen onDone={() => navigate('/dashboard')} />
  if (path === '/practice') return <PianoTutor account={account} onExit={() => navigate('/dashboard')} onHistoryChange={(history) => saveAccount({ ...account, history, xp: account.xp + (history.length > account.history.length ? 25 : 0) })} />
  return <Dashboard account={account} onPractice={() => navigate('/practice')} onSignOut={signOut} />
}

function PianoTutor({ account, onExit, onHistoryChange }: { account: Account; onExit: () => void; onHistoryChange: (history: Sequence[]) => void }) {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set())
  const [midiStatus, setMidiStatus] = useState('MIDI is not connected')
  const [recording, setRecording] = useState(false)
  const [sequences, setSequences] = useState<Sequence[]>(account.history)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [sound, setSound] = useState<SoundName>('Concert Grand')
  const [selectedPieceId, setSelectedPieceId] = useState(PIECES[0].id)
  const [lessonProgress, setLessonProgress] = useState(0)
  const [lessonFeedback, setLessonFeedback] = useState('Choose a piece, then start the lesson. Your timing is measured against each expected note.')
  const [lessonActive, setLessonActive] = useState(false)
  const [lessonPaused, setLessonPaused] = useState(false)
  const [lessonClock, setLessonClock] = useState(0)
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null)
  const [aiFeedback, setAiFeedback] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [studioMenuOpen, setStudioMenuOpen] = useState(false)
  const [studioTab, setStudioTab] = useState<'lessons' | 'sounds' | 'record' | 'history'>('lessons')
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null)
  const [focusPractice, setFocusPractice] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const voicesRef = useRef(new Map<string, Voice>())
  const heldSourcesRef = useRef(new Map<string, Set<Source>>())
  const recordingStartRef = useRef(0)
  const recordedEventsRef = useRef<NoteEvent[]>([])
  const recordingRef = useRef(false)
  const replayTimeoutsRef = useRef<number[]>([])
  const particlesRef = useRef<Particle[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pianoRef = useRef<HTMLDivElement | null>(null)
  const keyRefs = useRef(new Map<string, HTMLButtonElement>())
  const lastSharedHistoryRef = useRef(JSON.stringify(account.history))
  const lessonRef = useRef<{ piece: Piece; startedAt: number; index: number; latencies: number[]; wrongNotes: number; pausedAt?: number } | null>(null)

  useEffect(() => {
    const encoded = JSON.stringify(sequences)
    if (encoded !== lastSharedHistoryRef.current) { lastSharedHistoryRef.current = encoded; onHistoryChange(sequences) }
  }, [onHistoryChange, sequences])

  const ensureAudio = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) throw new Error('Web Audio is unavailable in this browser.')
      audioContextRef.current = new AudioContextClass()
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume()
    return audioContextRef.current
  }, [])

  const addParticle = useCallback((note: string) => {
    const piano = pianoRef.current
    const key = keyRefs.current.get(note)
    if (!piano || !key) return
    const pianoBox = piano.getBoundingClientRect()
    const keyBox = key.getBoundingClientRect()
    const pitch = ALL_NOTES.indexOf(note) / (ALL_NOTES.length - 1)
    particlesRef.current.push({
      x: keyBox.left - pianoBox.left + keyBox.width / 2,
      y: keyBox.top - pianoBox.top,
      width: Math.max(10, keyBox.width * 0.62),
      hue: 28 + pitch * 35,
      born: performance.now(),
      life: 1050,
    })
  }, [])

  const capture = useCallback((type: EventType, note: string, velocity: number, source: Source) => {
    if (recordingRef.current) {
      recordedEventsRef.current.push({ type, note, velocity, source, time_ms: performance.now() - recordingStartRef.current })
    }
  }, [])

  const handleNoteOn = useCallback((note: string, velocity = 100, source: Source = 'keyboard') => {
    if (!ALL_NOTES.includes(note)) return
    const currentSources = heldSourcesRef.current.get(note) ?? new Set<Source>()
    if (currentSources.has(source)) return
    const wasSilent = currentSources.size === 0
    currentSources.add(source)
    heldSourcesRef.current.set(note, currentSources)
    if (!wasSilent) return

    const context = ensureAudio()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.type = sound === 'Electric Piano' ? 'sine' : sound === 'Organ' ? 'square' : sound === 'Harpsichord' ? 'sawtooth' : 'triangle'
    oscillator.frequency.setValueAtTime(noteToFrequency(note), now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.04 + (Math.min(127, Math.max(1, velocity)) / 127) * 0.16, now + 0.018)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    voicesRef.current.set(note, { oscillator, gain })
    setActiveNotes((previous) => new Set(previous).add(note))
    addParticle(note)
    capture('note_on', note, velocity, source)
    const lesson = lessonRef.current
    if (lesson && !lesson.pausedAt && source !== 'replay') {
      const step = lesson.piece.steps[lesson.index]
      if (step?.note === note) {
        const latency = performance.now() - lesson.startedAt - step.time
        lesson.latencies.push(latency); lesson.index += 1; setLessonProgress(lesson.index)
        if (lesson.index === lesson.piece.steps.length) {
          const average = lesson.latencies.reduce((total, value) => total + value, 0) / lesson.latencies.length
          const late = lesson.latencies.filter((value) => value > 120).length
          const result = { correct: lesson.latencies.length, total: lesson.piece.steps.length, averageLatency: average, lateNotes: late, wrongNotes: lesson.wrongNotes }
          setLessonResult(result); setLessonActive(false)
          setLessonFeedback(`Finished: ${Math.round((result.correct / (result.correct + result.wrongNotes)) * 100)}% note accuracy. Average timing ${Math.round(Math.abs(average))} ms ${average > 0 ? 'late' : 'early'}; ${late} notes were more than 120 ms late.`)
          lessonRef.current = null
        } else setLessonFeedback(`${Math.round(Math.abs(latency))} ms ${latency >= 0 ? 'late' : 'early'} — next note: ${lesson.piece.steps[lesson.index].note}`)
      } else { lesson.wrongNotes += 1; setLessonFeedback(`Expected ${step?.note}; you played ${note}. Try the highlighted next note.`) }
    }
  }, [addParticle, capture, ensureAudio, sound])

  const handleNoteOff = useCallback((note: string, source?: Source) => {
    const sources = heldSourcesRef.current.get(note)
    if (!sources) return
    if (source) sources.delete(source)
    else sources.clear()
    if (sources.size) return
    heldSourcesRef.current.delete(note)
    const voice = voicesRef.current.get(note)
    if (voice && audioContextRef.current) {
      const now = audioContextRef.current.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now)
      voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.07)
      voice.oscillator.stop(now + 0.08)
      voicesRef.current.delete(note)
    }
    setActiveNotes((previous) => { const next = new Set(previous); next.delete(note); return next })
    capture('note_off', note, 0, source ?? 'replay')
  }, [capture])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const note = KEYBOARD_MAP[event.key.toLowerCase()]
      if (!note || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      handleNoteOn(note, 100, 'keyboard')
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const note = KEYBOARD_MAP[event.key.toLowerCase()]
      if (note) handleNoteOff(note, 'keyboard')
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [handleNoteOff, handleNoteOn])

  useEffect(() => {
    if (!lessonActive || lessonPaused) return
    const timer = window.setInterval(() => setLessonClock(performance.now()), 50)
    return () => window.clearInterval(timer)
  }, [lessonActive, lessonPaused])

  useEffect(() => {
    let animationFrame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const piano = pianoRef.current
      if (canvas && piano) {
        const rect = piano.getBoundingClientRect()
        const ratio = window.devicePixelRatio || 1
        if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
          canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio)
          canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`
        }
        const context = canvas.getContext('2d')
        if (context) {
          context.setTransform(ratio, 0, 0, ratio, 0, 0)
          context.clearRect(0, 0, rect.width, rect.height)
          const now = performance.now()
          particlesRef.current = particlesRef.current.filter((particle) => now - particle.born < particle.life && particle.y > -24)
          for (const particle of particlesRef.current) {
            const progress = (now - particle.born) / particle.life
            const y = particle.y - progress * 180
            context.globalAlpha = (1 - progress) * 0.85
            context.fillStyle = `hsl(${particle.hue} 90% 62%)`
            context.beginPath(); context.roundRect(particle.x - particle.width / 2, y, particle.width, 18, 7); context.fill()
          }
          context.globalAlpha = 1
        }
      }
      animationFrame = requestAnimationFrame(draw)
    }
    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  const connectMidi = useCallback(async () => {
    const requestMidi = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }).requestMIDIAccess
    if (!requestMidi) { setMidiStatus('Web MIDI is unavailable in this browser (try Chrome or Edge).'); return }
    try {
      setMidiStatus('Requesting MIDI access…')
      const access = await requestMidi.call(navigator)
      let count = 0
      access.inputs.forEach((input) => {
        count += 1
        input.onmidimessage = ({ data }) => {
          const command = data[0] & 0xf0
          const note = midiToNote(data[1])
          const velocity = data[2]
          if (command === 0x90 && velocity > 0) handleNoteOn(note, velocity, 'midi')
          if (command === 0x80 || (command === 0x90 && velocity === 0)) handleNoteOff(note, 'midi')
        }
      })
      setMidiStatus(count ? `${count} MIDI input${count === 1 ? '' : 's'} connected` : 'MIDI access granted — no input device found')
    } catch { setMidiStatus('MIDI access was not granted.') }
  }, [handleNoteOff, handleNoteOn])

  const toggleRecording = useCallback(() => {
    if (!recordingRef.current) {
      recordedEventsRef.current = []; recordingStartRef.current = performance.now(); recordingRef.current = true; setRecording(true)
      return
    }
    const duration = performance.now() - recordingStartRef.current
    recordingRef.current = false; setRecording(false)
    const events = recordedEventsRef.current
    setSequences((previous) => [{ id: crypto.randomUUID(), title: `Practice take ${previous.length + 1}`, created_at: new Date().toISOString(), duration_ms: duration, events }, ...previous])
  }, [])

  const beginRecording = useCallback(() => {
    if (recording) return
    setStudioMenuOpen(false); setRecordingCountdown(3)
  }, [recording])

  useEffect(() => {
    if (recordingCountdown === null) return
    if (recordingCountdown === 0) {
      setRecordingCountdown(null); setFocusPractice(true); recordingStartRef.current = performance.now(); recordedEventsRef.current = []; recordingRef.current = true; setRecording(true)
      return
    }
    const timer = window.setTimeout(() => setRecordingCountdown((value) => value === null ? null : value - 1), 800)
    return () => window.clearTimeout(timer)
  }, [recordingCountdown])

  const stopFocusedRecording = useCallback(() => {
    if (recordingRef.current) toggleRecording()
    setFocusPractice(false)
  }, [toggleRecording])

  const startLesson = useCallback(() => {
    const piece = PIECES.find((item) => item.id === selectedPieceId) ?? PIECES[0]
    lessonRef.current = { piece, startedAt: performance.now() + 1800, index: 0, latencies: [], wrongNotes: 0 }
    setLessonProgress(0); setLessonResult(null); setAiFeedback(''); setLessonPaused(false); setLessonActive(true); setLessonClock(performance.now()); setLessonFeedback('Get ready… the first note reaches the timing line in 3, 2, 1.')
  }, [selectedPieceId])

  const toggleLessonPause = useCallback(() => {
    const lesson = lessonRef.current
    if (!lesson) return
    if (!lessonPaused) { lesson.pausedAt = performance.now(); setLessonPaused(true); setLessonFeedback('Lesson paused. Resume when you are ready.') }
    else { lesson.startedAt += performance.now() - (lesson.pausedAt ?? performance.now()); delete lesson.pausedAt; setLessonClock(performance.now()); setLessonPaused(false); setLessonFeedback(`Back in time. Next note: ${lesson.piece.steps[lesson.index]?.note ?? 'complete'}`) }
  }, [lessonPaused])

  const stopLesson = useCallback(() => {
    lessonRef.current = null; setLessonActive(false); setLessonPaused(false); setLessonProgress(0); setLessonFeedback('Lesson stopped. Choose a piece and start again when you are ready.')
  }, [])

  const requestAiFeedback = useCallback(async () => {
    setAiLoading(true); setAiFeedback('')
    try {
      const response = await fetch('/api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessonFeedback, lessonResult, piece: PIECES.find((item) => item.id === selectedPieceId)?.title }) })
      const payload = await response.json() as { feedback?: string; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'AI feedback failed')
      setAiFeedback(payload.feedback ?? '')
    } catch (error) { setAiFeedback(error instanceof Error ? error.message : 'AI feedback is unavailable.') }
    finally { setAiLoading(false) }
  }, [lessonFeedback, selectedPieceId])

  const cancelReplay = useCallback(() => {
    replayTimeoutsRef.current.forEach(window.clearTimeout); replayTimeoutsRef.current = []; setPlayingId(null)
    Array.from(heldSourcesRef.current.keys()).forEach((note) => handleNoteOff(note, 'replay'))
  }, [handleNoteOff])

  const replay = useCallback((sequence: Sequence) => {
    cancelReplay(); setPlayingId(sequence.id)
    sequence.events.forEach((event) => {
      const timeout = window.setTimeout(() => {
        if (event.type === 'note_on') handleNoteOn(event.note, event.velocity, 'replay')
        else handleNoteOff(event.note, 'replay')
      }, event.time_ms)
      replayTimeoutsRef.current.push(timeout)
    })
    replayTimeoutsRef.current.push(window.setTimeout(() => setPlayingId(null), sequence.duration_ms + 100))
  }, [cancelReplay, handleNoteOff, handleNoteOn])

  useEffect(() => () => { replayTimeoutsRef.current.forEach(window.clearTimeout); voicesRef.current.forEach((voice) => voice.oscillator.stop()); audioContextRef.current?.close() }, [])

  const deleteSequence = (id: string) => setSequences((previous) => previous.filter((sequence) => sequence.id !== id))
  const resetHistory = () => { cancelReplay(); setSequences([]) }

  /* Inactive until a Supabase client is supplied. This maps directly to sequences and sequence_notes tables. */
  async function persistSequenceToSupabase(supabase: SupabaseClientLike, sequence: Sequence) {
    const { data, error } = await supabase.from('sequences').insert({ id: sequence.id, title: sequence.title, created_at: sequence.created_at, duration_ms: sequence.duration_ms }).select().single()
    if (error || !data) throw error ?? new Error('Sequence insert returned no row')
    const { error: notesError } = await supabase.from('sequence_notes').insert(sequence.events.map((event) => ({ sequence_id: data.id, type: event.type, note: event.note, velocity: event.velocity, source: event.source, time_ms: event.time_ms })))
    if (notesError) throw notesError
  }
  void persistSequenceToSupabase

  const selectedPiece = PIECES.find((piece) => piece.id === selectedPieceId) ?? PIECES[0]
  const lessonStart = lessonRef.current?.startedAt ?? 0
  const elapsed = lessonActive ? (lessonPaused ? (lessonRef.current?.pausedAt ?? lessonClock) - lessonStart : lessonClock - lessonStart) : 0

  return (
    <main style={{ minHeight: '100vh', background: '#111111', color: '#f0f0f0', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', padding: lessonActive ? '0' : '28px 20px', filter: 'grayscale(1)' }}>
      <div style={{ maxWidth: lessonActive ? undefined : 1180, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: lessonActive ? 0 : 20, padding: lessonActive ? '10px 20px' : 0, minHeight: lessonActive ? 58 : undefined, flexWrap: 'wrap' }}>
          <div><button onClick={onExit} style={{ ...buttonStyle, padding: '5px 8px', marginBottom: lessonActive ? 0 : 11 }}>← Dashboard</button>{!lessonActive && <><p style={{ color: '#d8d8d8', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', margin: '10px 0 8px', fontFamily: 'Arial, sans-serif' }}>LIVE INSTRUMENT · {account.name.toUpperCase()}</p><h1 style={{ margin: 0, fontSize: 34 }}>Piano tutor</h1></>}</div>
          {lessonActive ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Arial, sans-serif' }}><strong style={{ fontSize: 14 }}>{selectedPiece.title}</strong><button onClick={toggleLessonPause} style={buttonStyle}>{lessonPaused ? 'Resume' : 'Pause'}</button><button onClick={stopLesson} style={{ ...buttonStyle, color: '#f2b8b8' }}>Stop</button></div> : <button onClick={() => setStudioMenuOpen((open) => !open)} style={buttonStyle}>{studioMenuOpen ? 'Close menu' : 'Practice menu'}</button>}
        </header>
        <section style={{ ...panelStyle, display: lessonActive || !studioMenuOpen ? 'none' : undefined, position: 'fixed', right: 20, top: 76, width: 340, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}><div><p style={{ margin: 0, color: '#a8a8a8', fontSize: 12, fontFamily: 'Arial, sans-serif', letterSpacing: '.12em' }}>SOUNDS</p><h2 style={{ margin: '5px 0 0', fontSize: 20 }}>Choose your instrument</h2></div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{(['Concert Grand', 'Electric Piano', 'Organ', 'Harpsichord'] as SoundName[]).map((name) => <button key={name} onClick={() => setSound(name)} style={{ ...buttonStyle, background: sound === name ? '#e6e6e6' : '#303030', color: sound === name ? '#101010' : '#eeeeee', borderColor: sound === name ? '#ffffff' : '#555555' }}>{name}</button>)}</div></div>
        </section>
        <section style={{ ...panelStyle, display: lessonActive || !studioMenuOpen ? 'none' : undefined, position: 'fixed', right: 20, top: 174, width: 340, maxHeight: 'calc(100vh - 194px)', overflowY: 'auto', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><p style={{ margin: 0, color: '#a8a8a8', fontSize: 12, fontFamily: 'Arial, sans-serif', letterSpacing: '.12em' }}>LEARN A PIECE</p><h2 style={{ margin: '5px 0 0', fontSize: 20 }}>Guided timing lesson</h2></div><button onClick={startLesson} style={{ ...buttonStyle, background: '#f0f0f0', color: '#111', borderColor: '#fff' }}>Start lesson</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 9, marginTop: 14 }}>{PIECES.map((piece) => <button key={piece.id} onClick={() => { setSelectedPieceId(piece.id); setLessonProgress(0); setAiFeedback(''); setLessonFeedback(`${piece.title} selected. Difficulty: ${piece.difficulty}.`) }} style={{ textAlign: 'left', ...buttonStyle, padding: 13, background: selectedPieceId === piece.id ? '#eeeeee' : '#1d1d1d', color: selectedPieceId === piece.id ? '#111' : '#eee', borderColor: selectedPieceId === piece.id ? '#fff' : '#4d4d4d' }}><strong>{piece.title}</strong><span style={{ display: 'block', marginTop: 4, fontSize: 12, opacity: .72 }}>{piece.composer} · {piece.difficulty}</span></button>)}</div>
          <div style={{ marginTop: 13, padding: 12, background: '#181818', border: '1px solid #3d3d3d', borderRadius: 8, fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#d5d5d5' }}><b>{lessonProgress}/{selectedPiece.steps.length} notes</b> · {lessonFeedback}</div>
          {lessonResult && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, fontFamily: 'Arial, sans-serif' }}><span style={metricStyle}>Accuracy {Math.round((lessonResult.correct / (lessonResult.correct + lessonResult.wrongNotes)) * 100)}%</span><span style={metricStyle}>Average {Math.round(Math.abs(lessonResult.averageLatency))} ms {lessonResult.averageLatency >= 0 ? 'late' : 'early'}</span><span style={metricStyle}>{lessonResult.lateNotes} late notes</span></div>}
          <button onClick={requestAiFeedback} disabled={aiLoading || !lessonResult} style={{ ...buttonStyle, marginTop: 10, opacity: aiLoading || !lessonResult ? .6 : 1 }}>{aiLoading ? 'Analysing timing…' : 'Get AI timing insight'}</button>{aiFeedback && <p style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#dedede', lineHeight: 1.5 }}>{aiFeedback}</p>}
        </section>
        <section style={lessonActive ? { background: 'transparent', border: 0, borderRadius: 0, padding: 0, boxShadow: 'none' } : panelStyle}>
          {!lessonActive && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, color: '#aaa', fontSize: 13 }}><span>C3 — B6 · click or connect a controller</span><span>{activeNotes.size ? `${activeNotes.size} note${activeNotes.size > 1 ? 's' : ''} playing` : 'Ready'}</span></div>}
          <div ref={pianoRef} style={{ position: 'relative', height: lessonActive ? 'calc(100vh - 58px)' : 'calc(100vh - 150px)', minHeight: 540, borderRadius: lessonActive ? 0 : 8, overflow: 'hidden', background: lessonActive ? '#181818' : 'linear-gradient(#242424, #161616 58%)', touchAction: 'none' }}>
            {lessonActive && <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 278, left: 0, right: 0, height: 3, background: '#f2f2f2', boxShadow: '0 0 12px #fff8' }} />
              {selectedPiece.steps.map((step, index) => { const position = noteKeyPosition(step.note); const bottom = 260 + (step.time - elapsed) * .13; if (bottom < 230 || bottom > 1000) return null; return <div key={`${index}-${step.note}`} style={{ position: 'absolute', zIndex: 2, bottom, left: position.left, width: position.width, height: 42, borderRadius: 4, background: index === lessonProgress ? '#f5f5f5' : '#8b8b8b', color: '#111', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'Arial, sans-serif', boxShadow: index === lessonProgress ? '0 0 16px #fff8' : 'none' }}>{step.note}</div> })}
            </div>}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 278, display: 'flex', zIndex: 2 }}>
              {WHITE_NOTES.map((note) => <button key={note} ref={(node) => { if (node) keyRefs.current.set(note, node) }} aria-label={note} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); handleNoteOn(note, 110, 'mouse') }} onPointerUp={() => handleNoteOff(note, 'mouse')} onPointerLeave={() => handleNoteOff(note, 'mouse')} style={{ ...whiteKeyStyle, background: activeNotes.has(note) ? '#d6d6d6' : '#f2f2f2' }}>{note}</button>)}
            </div>
            {BLACK_NOTES.map((note) => { const midi = 12 * (Number(note.slice(-1)) + 1) + NOTE_NAMES.indexOf(note.slice(0, -1)); const before = ALL_NOTES.slice(0, midi - 48).filter(isWhite).length; return <button key={note} ref={(node) => { if (node) keyRefs.current.set(note, node) }} aria-label={note} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); handleNoteOn(note, 110, 'mouse') }} onPointerUp={() => handleNoteOff(note, 'mouse')} onPointerLeave={() => handleNoteOff(note, 'mouse')} style={{ ...blackKeyStyle, left: `calc(${(before / WHITE_NOTES.length) * 100}% - 1.15%)`, background: activeNotes.has(note) ? '#dadada' : '#141414' }}>{note}</button> })}
          </div>
        </section>
        <section style={{ ...panelStyle, marginTop: 18, display: lessonActive ? 'none' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Recording</h2><p style={{ margin: '5px 0 0', color: '#aaa', fontSize: 13, fontFamily: 'Arial, sans-serif' }}>{recording ? 'Capturing note events with performance timing…' : 'Record a phrase, then replay its original timing.'}</p></div><button onClick={toggleRecording} style={{ ...buttonStyle, background: recording ? '#7b3030' : '#4d4d4d' }}>{recording ? 'Stop recording' : 'Start recording'}</button></div>
        </section>
        <section style={{ ...panelStyle, marginTop: 18, display: lessonActive ? 'none' : undefined }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 18 }}>History</h2><button onClick={resetHistory} disabled={!sequences.length} style={{ ...buttonStyle, opacity: sequences.length ? 1 : .45 }}>Reset history</button></div>
          {sequences.length === 0 ? <p style={{ color: '#8c96a8', margin: '24px 0 4px' }}>No saved sequences yet.</p> : <div style={{ marginTop: 15, display: 'grid', gap: 9 }}>{sequences.map((sequence) => <div key={sequence.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 15, borderTop: '1px solid #273142', paddingTop: 12, flexWrap: 'wrap' }}><div><strong>{sequence.title}</strong><div style={{ color: '#8c96a8', fontSize: 13, marginTop: 3 }}>{sequence.events.filter((event) => event.type === 'note_on').length} notes · {(sequence.duration_ms / 1000).toFixed(2)}s</div></div><div style={{ display: 'flex', gap: 8 }}><button disabled={playingId !== null} onClick={() => replay(sequence)} style={{ ...buttonStyle, opacity: playingId !== null ? .5 : 1 }}>{playingId === sequence.id ? 'Playing…' : 'Replay'}</button><button onClick={() => deleteSequence(sequence.id)} style={{ ...buttonStyle, color: '#fca5a5' }}>Delete</button></div></div>)}</div>}
        </section>
      </div>
    </main>
  )
}

const panelStyle = { background: '#181818', border: '1px solid #3d3d3d', borderRadius: 12, padding: 20, boxShadow: '0 18px 50px rgba(0,0,0,.18)' }
const buttonStyle = { border: '1px solid #515151', background: '#2a2a2a', color: '#f0f0f0', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }
const whiteKeyStyle = { flex: 1, minWidth: 0, border: '1px solid #858585', borderBottom: 0, borderRadius: '0 0 4px 4px', color: '#3b3b3b', fontSize: 10, paddingTop: 230, cursor: 'pointer', boxShadow: 'inset 0 -12px 18px #0002' }
const blackKeyStyle = { position: 'absolute' as const, zIndex: 4, bottom: 128, width: '2.3%', height: 178, border: '1px solid #000', borderRadius: '0 0 4px 4px', color: '#e6e6e6', fontSize: 9, cursor: 'pointer', boxShadow: '0 4px 6px #000a' }
const metricStyle = { background: '#eeeeee', color: '#171717', borderRadius: 5, padding: '6px 8px', fontSize: 12 }

function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <main style={{ minHeight: '100vh', color: '#eeeeee', background: '#111111', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
    <header style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ letterSpacing: '.08em', fontSize: 14 }}>♫ PIANO TUTOR</strong><div style={{ display: 'flex', gap: 9 }}><button onClick={() => onNavigate('/login')} style={buttonStyle}>Log in</button><button onClick={() => onNavigate('/signup')} style={{ ...buttonStyle, background: '#f1f1f1', color: '#111', borderColor: '#fff' }}>Create account</button></div></header>
    <section style={{ minHeight: 440, display: 'grid', placeItems: 'center', padding: '70px 24px 84px', textAlign: 'center', borderBottom: '1px solid #333', background: 'radial-gradient(circle at 50% 10%, #333 0, #111 52%)' }}><div style={{ maxWidth: 760 }}><p style={{ color: '#aaa', letterSpacing: '.14em', fontSize: 12, fontWeight: 700 }}>PLAY · LEARN · IMPROVE</p><h1 style={{ fontSize: 'clamp(42px, 8vw, 78px)', letterSpacing: '-.06em', lineHeight: .96, margin: '14px 0 20px' }}>Learn piano by playing.</h1><p style={{ color: '#bdbdbd', fontSize: 17, lineHeight: 1.6, maxWidth: 610, margin: '0 auto 28px' }}>A focused piano studio with a playable keyboard, falling-note lessons, precise timing feedback, and optional AI coaching.</p><div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}><button onClick={() => onNavigate('/practice')} style={{ ...buttonStyle, background: '#f1f1f1', color: '#111', borderColor: '#fff', padding: '12px 16px' }}>Try it now — no account</button><button onClick={() => onNavigate('/signup')} style={{ ...buttonStyle, padding: '12px 16px' }}>Save your progress</button></div></div></section>
    <section style={{ maxWidth: 1120, margin: '0 auto', padding: '58px 24px' }}><p style={{ color: '#9b9b9b', fontWeight: 700, fontSize: 12, letterSpacing: '.14em' }}>HOW IT WORKS</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16 }}><LandingCard number="01" title="Choose your sound" text="Play Concert Grand, Electric Piano, Organ, or Harpsichord from your browser, MIDI keyboard, or computer keys." /><LandingCard number="02" title="Follow a piece" text="Pick a graded lesson such as Ode to Joy or Für Elise. Notes fall directly onto the keys you need to play." /><LandingCard number="03" title="See real timing" text="Each expected note is measured in milliseconds. You see your accuracy, early/late average, and late-note count." /><LandingCard number="04" title="Get useful feedback" text="With a Gemini API key connected, the coach turns measured timing results into a short, specific next practice step." /></div></section>
    <section style={{ background: '#1b1b1b', borderTop: '1px solid #353535', borderBottom: '1px solid #353535' }}><div style={{ maxWidth: 1120, margin: '0 auto', padding: '50px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(250px, .9fr)', gap: 30, alignItems: 'center' }}><div><p style={{ color: '#aaa', fontWeight: 700, fontSize: 12, letterSpacing: '.14em' }}>BUILT FOR REAL PRACTICE</p><h2 style={{ fontSize: 31, letterSpacing: '-.04em', margin: '10px 0' }}>Use it your way.</h2><p style={{ color: '#bdbdbd', lineHeight: 1.6, margin: 0 }}>Connect MIDI during setup for the most accurate input, or skip it and use the on-screen keyboard. You can try lessons without an account; create one when you want to retain recordings and progress.</p></div><div style={{ border: '1px solid #4a4a4a', borderRadius: 10, padding: 18, background: '#111' }}><strong>What the AI does—and doesn’t do</strong><p style={{ color: '#bdbdbd', lineHeight: 1.55, fontSize: 14 }}>It receives measured lesson timing, not invented performance scores. It explains whether you were early or late and suggests a focused drill.</p></div></div></section>
    <footer style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 24px 38px', display: 'flex', justifyContent: 'space-between', gap: 15, flexWrap: 'wrap', color: '#909090', fontSize: 13 }}><span>Start with a keyboard. Keep growing with feedback.</span><button onClick={() => onNavigate('/practice')} style={{ background: 'none', border: 0, color: '#eee', cursor: 'pointer', fontSize: 13 }}>Open practice →</button></footer>
  </main>
}

function LandingCard({ number, title, text }: { number: string; title: string; text: string }) { return <article style={{ border: '1px solid #3d3d3d', borderRadius: 10, padding: 18, background: '#181818' }}><span style={{ color: '#9a9a9a', fontSize: 12, fontWeight: 700 }}>{number}</span><h2 style={{ fontSize: 19, margin: '16px 0 8px' }}>{title}</h2><p style={{ color: '#b7b7b7', lineHeight: 1.55, fontSize: 14, margin: 0 }}>{text}</p></article> }

function AuthScreen({ registering, onNavigate, onAuthenticated, onTryGuest }: { registering: boolean; onNavigate: (path: string) => void; onAuthenticated: (account: Account) => void; onTryGuest: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const accounts: Account[] = JSON.parse(localStorage.getItem('piano-tutor-accounts') ?? '[]')
    const existing = accounts.find((account) => account.email.toLowerCase() === email.trim().toLowerCase())
    if (registering) {
      if (!name.trim() || !email.trim() || password.length < 4) { setError('Add your name, email, and a password of at least 4 characters.'); return }
      if (existing) { setError('An account already exists for this email.'); return }
      onAuthenticated({ id: crypto.randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), password, history: [], xp: 0, streak: 0, joined_at: new Date().toISOString() })
    } else {
      if (!existing || existing.password !== password) { setError('Email or password is not correct.'); return }
      onAuthenticated(existing)
    }
  }
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, color: '#f0f0f0', background: '#111111', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
    <form onSubmit={submit} style={{ width: 'min(100%, 430px)', background: '#181818', border: '1px solid #3d3d3d', padding: 30, borderRadius: 12, boxShadow: '0 28px 80px #0008' }}>
      <p style={{ margin: 0, color: '#d8d8d8', fontWeight: 700, fontSize: 12, letterSpacing: '.14em', fontFamily: 'Arial, sans-serif' }}>PIANO TUTOR</p><h1 style={{ margin: '10px 0 7px', fontSize: 32 }}>{registering ? 'Build your practice space' : 'Welcome back'}</h1><p style={{ color: '#bcbcbc', lineHeight: 1.5, marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>{registering ? 'Save progress, goals, and practice history to your account on this device.' : 'Sign in to continue your personal learning path.'}</p>
      {registering && <label style={labelStyle}>Name<input required value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} placeholder="Your name" /></label>}
      <label style={labelStyle}>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} placeholder="you@example.com" /></label>
      <label style={labelStyle}>Password<input required type="password" minLength={4} value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} placeholder="••••••••" /></label>
      {error && <p style={{ color: '#e6a29a', fontSize: 13 }}>{error}</p>}<button style={{ ...buttonStyle, width: '100%', background: '#eeeeee', color: '#111', borderColor: '#fff', marginTop: 10 }} type="submit">{registering ? 'Create account' : 'Sign in'}</button>
      <button type="button" onClick={() => { setError(''); onNavigate(registering ? '/login' : '/signup') }} style={{ ...buttonStyle, border: 0, width: '100%', marginTop: 8 }}>{registering ? 'I already have an account' : 'Create an account'}</button>
      <button type="button" onClick={onTryGuest} style={{ ...buttonStyle, width: '100%', marginTop: 17, borderColor: '#686868', color: '#eeeeee' }}>Try the piano without an account</button>
      <p style={{ color: '#9a9a9a', fontSize: 11, lineHeight: 1.45, marginTop: 14, fontFamily: 'Arial, sans-serif' }}>Guest sessions work immediately but are not saved after you leave. Signed-in accounts are stored only in this browser for now.</p>
    </form>
  </main>
}

function MidiSetupScreen({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState('Connect a MIDI keyboard for the best lesson timing.')
  const [connecting, setConnecting] = useState(false)
  const connect = async () => {
    const requestMidi = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }).requestMIDIAccess
    if (!requestMidi) { setStatus('Web MIDI is not available here. You can still use your computer keyboard or mouse.'); return }
    try {
      setConnecting(true); setStatus('Waiting for MIDI permission…')
      const access = await requestMidi.call(navigator)
      setStatus(access.inputs.size ? 'MIDI keyboard connected. Opening your studio…' : 'Permission granted. No keyboard found, but you can connect one later.')
      window.setTimeout(onDone, 650)
    } catch { setStatus('MIDI permission was not granted. You can try again or continue without it.'); setConnecting(false) }
  }
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, color: '#f2f2f2', background: '#121212', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', position: 'relative' }}>
    <section style={{ textAlign: 'center', maxWidth: 420 }}><div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', margin: '0 auto 22px', border: '1px solid #666', borderRadius: 8, fontSize: 22 }}>♫</div><p style={{ margin: 0, color: '#aaa', fontSize: 12, fontWeight: 700, letterSpacing: '.16em' }}>PIANO TUTOR</p><h1 style={{ margin: '10px 0', fontSize: 31 }}>Connect your piano</h1><p style={{ margin: '0 auto 24px', color: '#b9b9b9', lineHeight: 1.55, fontSize: 14 }}>{status}</p><button onClick={connect} disabled={connecting} style={{ ...buttonStyle, background: '#f1f1f1', color: '#111', borderColor: '#fff', opacity: connecting ? .65 : 1 }}>{connecting ? 'Connecting…' : 'Connect MIDI device'}</button></section>
    <button onClick={onDone} style={{ position: 'absolute', left: 22, bottom: 20, background: 'transparent', color: '#9e9e9e', border: 0, fontSize: 13, cursor: 'pointer' }}>Skip for now</button>
  </main>
}

function Dashboard({ account, onPractice, onSignOut }: { account: Account; onPractice: () => void; onSignOut: () => void }) {
  const sessions = account.history
  const notes = sessions.reduce((sum, session) => sum + session.events.filter((event) => event.type === 'note_on').length, 0)
  const minutes = sessions.reduce((sum, session) => sum + session.duration_ms, 0) / 60000
  const level = Math.floor(account.xp / 100) + 1
  const progress = account.xp % 100
  const graph = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (6 - index))
    return Math.min(110, sessions.filter((session) => { const created = new Date(session.created_at); created.setHours(0, 0, 0, 0); return created.getTime() === day.getTime() }).reduce((total, session) => total + session.duration_ms / 1000, 0))
  })
  const coaching = sessions.length ? `You completed ${sessions.length} recorded ${sessions.length === 1 ? 'session' : 'sessions'}. Your next gain is consistency: repeat a short phrase at a steady tempo before increasing speed.` : 'Start with a short, slow recording. Your first session gives the coach a baseline for timing and consistency.'
  return <main style={{ minHeight: '100vh', color: '#f0f0f0', background: '#111111', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', padding: '28px 20px 48px', filter: 'grayscale(1)' }}><div style={{ maxWidth: 1120, margin: '0 auto' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 31, flexWrap: 'wrap' }}><div><p style={{ color: '#c5a36a', fontSize: 12, margin: 0, fontWeight: 700, letterSpacing: '.14em', fontFamily: 'Arial, sans-serif' }}>YOUR LEARNING STUDIO</p><h1 style={{ fontSize: 30, margin: '8px 0 0' }}>Welcome, {account.name}.</h1></div><div style={{ display: 'flex', gap: 9 }}><button onClick={onSignOut} style={buttonStyle}>{account.guest ? 'Sign in to save' : 'Sign out'}</button><button onClick={onPractice} style={{ ...buttonStyle, background: '#6f5c3e' }}>Open piano →</button></div></header>
    {account.guest && <div style={{ ...panelStyle, marginBottom: 18, padding: '12px 16px', borderColor: '#7a6748', color: '#dfcfad', fontFamily: 'Arial, sans-serif', fontSize: 13 }}>You’re trying Piano Tutor as a guest. Your recordings and progress will disappear when you leave — sign in or create an account to save them.</div>}
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}><Stat label="Current level" value={`Level ${level}`} detail={`${account.xp} XP total`} /><Stat label="Practice time" value={`${minutes.toFixed(1)} min`} detail="Recorded practice" /><Stat label="Notes played" value={String(notes)} detail="Across all sessions" /><Stat label="Daily streak" value={`${account.streak} days`} detail="Record today to grow it" /></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, .85fr)', gap: 18 }}>
      <div style={panelStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><p style={{ color: '#c5a36a', fontWeight: 700, fontSize: 12, margin: 0, letterSpacing: '.1em', fontFamily: 'Arial, sans-serif' }}>AI INSIGHTS</p><h2 style={{ margin: '7px 0', fontSize: 21 }}>Your next best practice</h2></div><span style={{ color: '#e0bf7c', fontSize: 13 }}>✦ Adaptive plan</span></div><p style={{ color: '#c8c1b6', lineHeight: 1.55, margin: '14px 0 18px', fontFamily: 'Arial, sans-serif' }}>{coaching}</p><div style={{ background: '#1b1a19', borderRadius: 11, padding: 13, border: '1px solid #4e493f' }}><strong>Recommended piece: Ode to Joy — foundation arrangement</strong><p style={{ color: '#aaa298', margin: '6px 0 0', fontSize: 13, fontFamily: 'Arial, sans-serif' }}>Matches your current activity: clear melody, manageable hand coordination, and room to develop rhythm.</p></div><button onClick={onPractice} style={{ ...buttonStyle, marginTop: 16, background: '#6f5c3e' }}>Start guided practice</button></div>
      <div style={panelStyle}><p style={{ color: '#c5a36a', fontWeight: 700, fontSize: 12, margin: 0, letterSpacing: '.1em', fontFamily: 'Arial, sans-serif' }}>LEVEL PROGRESS</p><h2 style={{ margin: '7px 0 15px', fontSize: 21 }}>{progress}/100 XP to Level {level + 1}</h2><div style={{ height: 10, borderRadius: 10, background: '#4a4640', overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#a98854,#ddc28d)' }} /></div><p style={{ color: '#aaa298', fontSize: 13, lineHeight: 1.45, fontFamily: 'Arial, sans-serif' }}>Record a focused practice take to earn 25 XP. Complete the weekly challenge to unlock the Rhythm Keeper badge.</p></div>
    </section>
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(300px, .85fr)', gap: 18, marginTop: 18 }}>
      <div style={panelStyle}><p style={{ color: '#c5a36a', fontWeight: 700, fontSize: 12, margin: 0, letterSpacing: '.1em', fontFamily: 'Arial, sans-serif' }}>PROGRESS · LAST 7 DAYS</p><h2 style={{ margin: '7px 0 15px', fontSize: 21 }}>Practice consistency</h2><svg viewBox="0 0 420 150" width="100%" height="160" role="img" aria-label="Weekly practice progress chart"><polyline fill="none" stroke="#c5a36a" strokeWidth="4" points={graph.map((value, index) => `${index * 68 + 5},${130 - value}`).join(' ')} /><polyline fill="none" stroke="#c5a36a22" strokeWidth="24" points={graph.map((value, index) => `${index * 68 + 5},${130 - value}`).join(' ')} />{graph.map((value, index) => <g key={index}><circle cx={index * 68 + 5} cy={130 - value} r="4" fill="#ead8ad" /><text x={index * 68 + 1} y="148" fill="#aaa298" fontSize="11">{['M','T','W','T','F','S','S'][index]}</text></g>)}</svg><p style={{ color: '#aaa298', fontSize: 12, margin: 0, fontFamily: 'Arial, sans-serif' }}>Daily / weekly / monthly views become more detailed as you save practice sessions.</p></div>
      <div style={panelStyle}><p style={{ color: '#c5a36a', fontWeight: 700, fontSize: 12, margin: 0, letterSpacing: '.1em', fontFamily: 'Arial, sans-serif' }}>PERSONAL GOALS</p><h2 style={{ margin: '7px 0 14px', fontSize: 21 }}>This week</h2><Goal complete={minutes >= 20} text="Practice 20 minutes every day" value={`${Math.min(20, minutes).toFixed(0)} / 20 min`} /><Goal complete={sessions.length >= 5} text="Finish 5 new exercises" value={`${sessions.length} / 5`} /><Goal complete={false} text="Improve rhythm by 10%" value="Start a guided session" /><Goal complete={false} text="Give your left hand extra focus" value="3 short drills" /></div>
    </section>
    <section style={{ ...panelStyle, marginTop: 18 }}><p style={{ color: '#c5a36a', fontWeight: 700, fontSize: 12, margin: 0, letterSpacing: '.1em', fontFamily: 'Arial, sans-serif' }}>LEARNING LAB</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: 12, marginTop: 14 }}><Module title="Sight-reading trainer" text="Generate bite-sized reading drills that adapt after each take." action="Start reading drill" onClick={onPractice} /><Module title="Composition challenge" text="Try a melody and chord progression prompt, then make it your own." action="Open challenge" onClick={onPractice} /><Module title="Performance report" text="Record a full take to unlock timing, dynamics, and consistency feedback." action="Record a take" onClick={onPractice} /><Module title="Interactive score" text="Score-following and real-time error marking are ready for a MIDI-backed lesson." action="Choose a lesson" onClick={onPractice} /></div></section>
    <p style={{ color: '#637084', lineHeight: 1.45, fontSize: 12, margin: '18px 2px 0' }}>Insights currently use your recorded session data in this browser. A production AI evaluation and microphone pitch recognition require a backend analysis service; MIDI remains the accurate input path here.</p>
  </div></main>
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <div style={panelStyle}><p style={{ color: '#91a0b6', fontSize: 12, margin: 0 }}>{label}</p><strong style={{ fontSize: 26, display: 'block', margin: '8px 0 4px' }}>{value}</strong><span style={{ color: '#617086', fontSize: 12 }}>{detail}</span></div> }
function Goal({ text, value, complete }: { text: string; value: string; complete: boolean }) { return <div style={{ borderTop: '1px solid #273142', padding: '10px 0', display: 'flex', gap: 9 }}><span style={{ color: complete ? '#4ade80' : '#64748b' }}>{complete ? '●' : '○'}</span><div><strong style={{ fontSize: 13 }}>{text}</strong><div style={{ fontSize: 12, color: '#92a1b5', marginTop: 3 }}>{value}</div></div></div> }
function Module({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) { return <article style={{ border: '1px solid #28364a', borderRadius: 12, padding: 14, background: '#0d131e' }}><strong>{title}</strong><p style={{ color: '#95a3b7', fontSize: 13, lineHeight: 1.45, minHeight: 54 }}>{text}</p><button onClick={onClick} style={{ ...buttonStyle, padding: '7px 9px', fontSize: 12 }}>{action} →</button></article> }
const labelStyle = { display: 'grid', gap: 7, color: '#c8d4e4', fontSize: 13, marginBottom: 14 }
const inputStyle = { width: '100%', boxSizing: 'border-box' as const, background: '#0a1019', color: '#f1f5f9', border: '1px solid #344257', borderRadius: 8, padding: '11px 12px', outline: 'none' }
