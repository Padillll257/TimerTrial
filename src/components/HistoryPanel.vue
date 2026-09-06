<script setup>
import { computed, reactive, ref } from 'vue'
import { formatDuration, formatTrialTimestamp } from '../utils/format.js'
import { useMissionStore } from '../store/missionStore.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const { exportTrialsLog, importTrialsLog, deleteTrial, clearAllTrials } = useMissionStore()

// Which trials currently show their per-waypoint breakdown. Purely local
// display state, kept per trial id so opening one doesn't affect the rest.
const expanded = reactive(new Set())

function toggle(trialId) {
  if (expanded.has(trialId)) {
    expanded.delete(trialId)
  } else {
    expanded.add(trialId)
  }
}

const fileInput = ref(null)
const feedback = ref(null) // { tone: 'ok' | 'error', message: string }
let feedbackTimer = null

function showFeedback(tone, message) {
  feedback.value = { tone, message }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedback.value = null
  }, 4000)
}

function downloadLog() {
  if (props.state.trials.length === 0) {
    showFeedback('error', 'No trials to export yet.')
    return
  }
  const json = exportTrialsLog()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const link = document.createElement('a')
  link.href = url
  link.download = `mission-log-${stamp}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInput.value?.click()
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // allow re-selecting the same file later
  if (!file) return

  try {
    const text = await file.text()
    const count = importTrialsLog(text)
    showFeedback('ok', `Imported ${count} trial${count === 1 ? '' : 's'}.`)
  } catch (err) {
    showFeedback('error', err.message || 'Import failed.')
  }
}

// --- Delete a single trial ---
async function onDeleteTrial(trial) {
  const ok = window.confirm(`Delete Trial ${trial.id}? This cannot be undone.`)
  if (!ok) return

  try {
    await deleteTrial(trial.id)
    expanded.delete(trial.id)
    showFeedback('ok', `Trial ${trial.id} deleted.`)
  } catch (err) {
    showFeedback('error', err.message || 'Failed to delete trial.')
  }
}

// --- Delete all trials ---
async function onClearAll() {
  if (props.state.trials.length === 0) return
  const ok = window.confirm(`Delete all ${props.state.trials.length} trials? This cannot be undone.`)
  if (!ok) return

  try {
    await clearAllTrials()
    expanded.clear()
    showFeedback('ok', 'All trials deleted.')
  } catch (err) {
    showFeedback('error', err.message || 'Failed to clear trials.')
  }
}

// --- Success vs Failed comparison ---
const stats = computed(() => {
  const total = props.state.trials.length
  const success = props.state.trials.filter((t) => t.outcome === 'success').length
  const failed = total - success
  const successRate = total === 0 ? 0 : Math.round((success / total) * 100)
  return { total, success, failed, successRate }
})
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="title">Mission History</h2>
      <div class="log-actions">
        <button
          type="button"
          class="icon-btn icon-btn-danger"
          aria-label="Delete all trials"
          title="Delete all trials"
          :disabled="state.trials.length === 0"
          @click="onClearAll"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 6h10M8.5 6V4.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V6M6.5 6l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="icon-btn" aria-label="Export log" title="Export log" @click="downloadLog">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 3v9M10 12l-3.5-3.5M10 12l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="icon-btn" aria-label="Import log" title="Import log" @click="triggerImport">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 12V3M10 3l-3.5 3.5M10 3l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="file-input" @change="onFileSelected" />
      </div>
    </div>

    <!-- Success vs Failed comparison -->
    <div v-if="stats.total > 0" class="stats-bar">
      <div class="stat-item" data-outcome="success">
        <span class="stat-value">{{ stats.success }}</span>
        <span class="stat-label">Success</span>
      </div>
      <div class="stat-item" data-outcome="failed">
        <span class="stat-value">{{ stats.failed }}</span>
        <span class="stat-label">Failed</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ stats.successRate }}%</span>
        <span class="stat-label">Rate</span>
      </div>
      <div class="stat-bar-track">
        <div class="stat-bar-fill" :style="{ width: stats.successRate + '%' }"></div>
      </div>
    </div>

    <p v-if="feedback" class="feedback" :data-tone="feedback.tone">{{ feedback.message }}</p>

    <p v-if="state.trials.length === 0" class="empty">
      Completed trials will show up here once a mission finishes.
    </p>

    <ul v-else class="trials">
      <li v-for="trial in state.trials" :key="trial.id" class="trial" :data-outcome="trial.outcome">
        <div class="trial-head">
          <div>
            <span class="trial-name">Trial {{ trial.id }}</span>
            <span class="trial-time">{{ formatTrialTimestamp(trial.startedAt) }}</span>
          </div>
          <div class="trial-summary">
            <span class="trial-outcome">{{ trial.outcome === 'success' ? 'Success' : 'Failed' }}</span>
            <span class="trial-total">{{ formatDuration(trial.totalTimeMs) }}</span>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn-danger trial-delete"
            :aria-label="`Delete Trial ${trial.id}`"
            title="Delete this trial"
            @click="onDeleteTrial(trial)"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 6h10M8.5 6V4.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V6M6.5 6l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            class="burger"
            :aria-expanded="expanded.has(trial.id)"
            :aria-label="`Toggle waypoint detail for Trial ${trial.id}`"
            @click="toggle(trial.id)"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <ul v-if="expanded.has(trial.id)" class="wp-detail">
          <li v-for="wp in trial.waypoints" :key="wp.id" class="wp-detail-row" :data-status="wp.status">
            <span class="wp-detail-label">{{ wp.label }}</span>
            <span class="wp-detail-time">{{ wp.timeMs != null ? formatDuration(wp.timeMs) : '--:--.--' }}</span>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.log-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--bg-panel-raised);
  color: var(--text-secondary);
}
.icon-btn:hover {
  color: var(--accent-strong);
  border-color: var(--accent-dim);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn svg {
  width: 16px;
  height: 16px;
}
.icon-btn-danger:hover:not(:disabled) {
  color: var(--danger-strong);
  border-color: var(--danger);
}

.file-input {
  display: none;
}

/* Success vs Failed comparison */
.stats-bar {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-row);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  min-width: 46px;
}

.stat-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-item[data-outcome='success'] .stat-value {
  color: var(--accent-strong);
}
.stat-item[data-outcome='failed'] .stat-value {
  color: var(--danger-strong);
}

.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
}

.stat-bar-track {
  flex: 1;
  min-width: 80px;
  height: 6px;
  border-radius: 999px;
  background: var(--danger);
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: var(--accent-strong);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.feedback {
  margin-top: 12px;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  color: var(--accent-strong);
  background: var(--bg-panel-raised);
}
.feedback[data-tone='error'] {
  color: var(--danger-strong);
  border-color: var(--danger);
}

.empty {
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-faint);
  line-height: 1.5;
}

.trials {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trial {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-row);
  padding: 12px 14px;
}
.trial[data-outcome='failed'] {
  border-color: rgba(181, 72, 46, 0.4);
}

.trial-head {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 10px;
}

.trial-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
}

.trial-time {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-faint);
}

.trial-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.trial-outcome {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-strong);
  text-align: right;
}
.trial[data-outcome='failed'] .trial-outcome {
  color: var(--danger-strong);
}

.trial-total {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text-primary);
}

.trial-delete {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

.burger {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--bg-panel-raised);
  padding: 0 7px;
}
.burger span {
  display: block;
  height: 2px;
  background: var(--text-secondary);
  border-radius: 1px;
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.burger[aria-expanded='true'] span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}
.burger[aria-expanded='true'] span:nth-child(2) {
  opacity: 0;
}
.burger[aria-expanded='true'] span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

.wp-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wp-detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.wp-detail-label {
  color: var(--text-secondary);
}

.wp-detail-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.wp-detail-row[data-status='failed'] .wp-detail-time {
  color: var(--danger-strong);
}
.wp-detail-row[data-status='pending'] .wp-detail-time {
  color: var(--text-faint);
}
</style>