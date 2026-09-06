import { reactive, readonly } from 'vue'

// Starting the timer *is* the takeoff, so it's not tracked as its own
// waypoint. The mission now ends at Landing instead of Gate 5.
const WAYPOINT_DEFS = [
  { id: 'gate1', label: 'Gate 1' },
  { id: 'gate2', label: 'Gate 2' },
  { id: 'gate3', label: 'Gate 3' },
  { id: 'gate4', label: 'Gate 4' },
  { id: 'gate5', label: 'Gate 5' },
  { id: 'landing', label: 'Landing' }
]

function freshWaypoints() {
  return WAYPOINT_DEFS.map((w) => ({ ...w, timeMs: null, status: 'pending' }))
}

const TRIALS_API_URL = '/api/trials'

const state = reactive({
  // 'idle' | 'running' | 'finished'
  status: 'idle',
  elapsedMs: 0,
  startedAt: null, // Date
  currentIndex: -1,
  waypoints: freshWaypoints(),
  outcome: null, // 'success' | 'failed' | null
  trials: [],
  // Backend trial-log sync. 'idle' before the first load, then one of:
  // 'loading' | 'synced' | 'offline' (no backend configured) | 'error'
  syncStatus: 'idle'
})

let intervalId = null

function tick() {
  if (!state.startedAt) return
  state.elapsedMs = Date.now() - state.startedAt.getTime()
}

function startMission() {
  if (state.status === 'running') return
  state.waypoints = freshWaypoints()
  state.status = 'running'
  state.outcome = null
  state.currentIndex = 0
  state.startedAt = new Date()
  state.elapsedMs = 0
  clearInterval(intervalId)
  intervalId = setInterval(tick, 50)
}

function finalizeTrial(outcome) {
  clearInterval(intervalId)
  state.status = 'finished'
  state.outcome = outcome
  const trial = {
    id: state.trials.length + 1,
    startedAt: state.startedAt,
    totalTimeMs: state.elapsedMs,
    outcome,
    waypoints: state.waypoints.map((w) => ({ ...w }))
  }
  state.trials.unshift(trial)
  persistTrial(trial)
}

function serializeTrial(trial) {
  return {
    startedAt: trial.startedAt.toISOString(),
    totalTimeMs: trial.totalTimeMs,
    outcome: trial.outcome,
    waypoints: trial.waypoints.map((w) => ({
      id: w.id,
      label: w.label,
      timeMs: w.timeMs,
      status: w.status
    }))
  }
}

// Fire-and-forget write to the backend trial log. Never blocks or breaks
// the in-app flow — if there's no backend configured yet (e.g. running
// locally without the Redis integration attached), the app just keeps
// working off local state and marks itself 'offline'.
async function persistTrial(trial) {
  try {
    const res = await fetch(TRIALS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializeTrial(trial))
    })
    if (res.status === 503) {
      state.syncStatus = 'offline'
      return
    }
    if (!res.ok) {
      state.syncStatus = 'error'
      return
    }
    state.syncStatus = 'synced'
  } catch {
    state.syncStatus = 'error'
  }
}

// Loads trial history from the backend and merges it in ahead of whatever
// is already in local state, so a fresh page load (or a new device) shows
// the full logged history instead of starting empty. Safe to call when no
// backend is configured yet — it just leaves local state untouched.
async function loadTrialsFromServer() {
  state.syncStatus = 'loading'
  try {
    const res = await fetch(TRIALS_API_URL)
    if (res.status === 503) {
      state.syncStatus = 'offline'
      return
    }
    if (!res.ok) {
      state.syncStatus = 'error'
      return
    }
    const { trials } = await res.json()
    if (!Array.isArray(trials) || trials.length === 0) {
      state.syncStatus = 'synced'
      return
    }

    const existingKeys = new Set(
      state.trials.map((t) => `${t.startedAt.toISOString()}|${t.totalTimeMs}|${t.outcome}`)
    )

    const incoming = []
    for (const raw of trials) {
      const startedAt = new Date(raw.startedAt)
      if (Number.isNaN(startedAt.getTime())) continue
      const key = `${startedAt.toISOString()}|${raw.totalTimeMs}|${raw.outcome}`
      if (existingKeys.has(key)) continue
      incoming.push({
        startedAt,
        totalTimeMs: raw.totalTimeMs,
        outcome: raw.outcome === 'success' ? 'success' : 'failed',
        waypoints: Array.isArray(raw.waypoints)
          ? raw.waypoints.map((w) => ({
              id: w.id ?? '',
              label: w.label ?? '',
              timeMs: typeof w.timeMs === 'number' ? w.timeMs : null,
              status: ['success', 'failed', 'pending'].includes(w.status) ? w.status : 'pending'
            }))
          : []
      })
    }

    if (incoming.length > 0) {
      state.trials = [...state.trials, ...incoming]
      renumberTrials()
    }
    state.syncStatus = 'synced'
  } catch {
    state.syncStatus = 'error'
  }
}

function markWaypoint(waypointStatus) {
  if (state.status !== 'running') return
  const wp = state.waypoints[state.currentIndex]
  if (!wp) return

  wp.timeMs = state.elapsedMs
  wp.status = waypointStatus

  if (waypointStatus === 'failed') {
    finalizeTrial('failed')
    return
  }

  const isLastWaypoint = state.currentIndex === state.waypoints.length - 1
  if (isLastWaypoint) {
    finalizeTrial('success')
  } else {
    state.currentIndex += 1
  }
}

function resetForNewTrial() {
  clearInterval(intervalId)
  state.status = 'idle'
  state.elapsedMs = 0
  state.startedAt = null
  state.currentIndex = -1
  state.outcome = null
  state.waypoints = freshWaypoints()
}

// Keeps "Trial N" numbering consistent and chronological (Trial 1 = earliest
// flight) after trials are merged in from an imported file. Newest-first
// order is preserved for display.
function renumberTrials() {
  const chronological = [...state.trials].sort((a, b) => a.startedAt - b.startedAt)
  chronological.forEach((trial, index) => {
    trial.id = index + 1
  })
  state.trials = chronological.reverse()
}

const LOG_FILE_VERSION = 1

function exportTrialsLog() {
  const payload = {
    app: 'drone-mission-timer',
    version: LOG_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    trials: state.trials.map((trial) => ({
      id: trial.id,
      startedAt: trial.startedAt.toISOString(),
      totalTimeMs: trial.totalTimeMs,
      outcome: trial.outcome,
      waypoints: trial.waypoints.map((w) => ({
        id: w.id,
        label: w.label,
        timeMs: w.timeMs,
        status: w.status
      }))
    }))
  }
  return JSON.stringify(payload, null, 2)
}

// Parses a previously exported log file and merges its trials into history.
// Throws with a readable message on invalid input; returns the number of
// trials that were added on success.
function importTrialsLog(jsonText) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('File is not valid JSON.')
  }

  const incoming = Array.isArray(parsed) ? parsed : parsed.trials
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new Error('No trials found in this file.')
  }

  const normalized = []
  for (const raw of incoming) {
    const startedAt = new Date(raw.startedAt)
    const totalTimeMs = Number(raw.totalTimeMs)
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(totalTimeMs)) continue

    normalized.push({
      startedAt,
      totalTimeMs,
      outcome: raw.outcome === 'success' ? 'success' : 'failed',
      waypoints: Array.isArray(raw.waypoints)
        ? raw.waypoints.map((w) => ({
            id: w.id ?? '',
            label: w.label ?? '',
            timeMs: typeof w.timeMs === 'number' ? w.timeMs : null,
            status: ['success', 'failed', 'pending'].includes(w.status) ? w.status : 'pending'
          }))
        : []
    })
  }

  if (normalized.length === 0) {
    throw new Error('No valid trials could be read from this file.')
  }

  state.trials = [...state.trials, ...normalized]
  renumberTrials()
  return normalized.length
}

export function useMissionStore() {
  return {
    state: readonly(state),
    startMission,
    markWaypoint,
    resetForNewTrial,
    exportTrialsLog,
    importTrialsLog,
    loadTrialsFromServer
  }
}