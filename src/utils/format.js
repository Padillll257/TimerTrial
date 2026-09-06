// Formats a duration in milliseconds as MM:SS.cc
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '--:--.--'
  const totalCentis = Math.floor(ms / 10)
  const centis = totalCentis % 100
  const totalSeconds = Math.floor(totalCentis / 100)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)

  const pad = (n, len = 2) => String(n).padStart(len, '0')
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`
}

// Formats a Date as a short, readable clock timestamp, e.g. "14:32:17"
export function formatClock(date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// Formats a Date as a short date + time for trial history entries.
export function formatTrialTimestamp(date) {
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
  return `${datePart} · ${formatClock(date)}`
}