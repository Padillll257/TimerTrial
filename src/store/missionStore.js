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

const state = reactive({
  // 'idle' | 'running' | 'finished'
  status: 'idle',
  elapsedMs: 0,
  startedAt: null, // Date
  currentIndex: -1,
  waypoints: freshWaypoints(),
  outcome: null, // 'success' | 'failed' | null
  trials: []
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
  state.trials.unshift({
    id: state.trials.length + 1,
    startedAt: state.startedAt,
    totalTimeMs: state.elapsedMs,
    outcome,
    waypoints: state.waypoints.map((w) => ({ ...w }))
  })
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
    importTrialsLog
  }
}