<script setup>
import { computed } from 'vue'
import { formatDuration } from '../utils/format.js'
import { useMissionStore } from '../store/missionStore.js'

const props = defineProps({
  state: { type: Object, required: true }
})
const emit = defineEmits(['start', 'mark', 'reset'])

const { setDropResult } = useMissionStore()

const RADIUS = 84
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const reachedCount = computed(
  () => props.state.waypoints.filter((w) => w.status !== 'pending').length
)
const progressFraction = computed(() => reachedCount.value / props.state.waypoints.length)
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progressFraction.value))

const statusLabel = computed(() => {
  switch (props.state.status) {
    case 'running':
      return 'In Progress'
    case 'finished':
      return props.state.outcome === 'success' ? 'Success' : 'Failed'
    default:
      return 'Ready'
  }
})

const missionTitle = computed(() => {
  if (props.state.status === 'idle') return 'Ready to Fly'
  if (props.state.status === 'running') return 'Mission Running'
  return props.state.outcome === 'success' ? 'Mission Complete' : 'Mission Aborted'
})

function isActive(index) {
  return props.state.status === 'running' && props.state.currentIndex === index
}

function rowState(wp, index) {
  if (isActive(index)) return 'active'
  if (wp.status === 'success') return 'success'
  if (wp.status === 'failed') return 'failed'
  return 'pending'
}

// The ring is the visual focal point and still works as its own tap
// target for starting the mission when idle. Once the mission is running,
// marking a gate is instead handled by the panel-wide tap handler below
// (onPanelActivate) so any point on the card works — the ring no longer
// marks on its own, otherwise a tap on the ring would double-fire.
function onRingActivate() {
  if (props.state.status === 'idle') {
    emit('start')
  }
}

// The single fixed-position action button below the ring changes role
// instead of moving: Start Mission -> Emergency Stop -> Start New Trial.
const actionButton = computed(() => {
  if (props.state.status === 'idle') {
    return { label: 'Start Mission', handler: () => emit('start'), variant: 'primary' }
  }
  if (props.state.status === 'running') {
    return { label: 'Emergency Stop', handler: () => emit('mark', 'failed'), variant: 'danger' }
  }
  return { label: 'Start New Trial', handler: () => emit('reset'), variant: 'ghost' }
})

// While a mission is running, the whole card is one big "gate passed"
// button — tapping anywhere inside it (the ring, the waypoint list, empty
// space, ...) logs the current gate. The only exception is the action
// button, which during "running" is Emergency Stop (`.cta`) and must only
// ever abort the trial, never also count as a gate tap. Idle and finished
// states are left alone: the dedicated Start / Start New Trial buttons
// still own tap-to-start / tap-to-reset there, and the drop-result buttons
// (only rendered when finished) have their own click handlers.
function onPanelActivate(event) {
  if (props.state.status !== 'running') return
  if (event.target.closest('.cta')) return
  emit('mark', 'success')
}

// Gate 4 payload-drop classification, offered once the trial is over.
const dropOptions = [
  { value: 'in_box', label: 'Masuk Kotak', icon: '✓', tone: 'success' },
  { value: 'near_area', label: 'Area Sekitar', icon: '±', tone: 'warn' },
  { value: 'missed', label: 'Gagal Drop', icon: '✕', tone: 'danger' }
]

function onDropSelect(value) {
  setDropResult(value)
}
</script>

<template>
  <section class="panel" :data-armed="state.status === 'running'" @click="onPanelActivate">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Current Mission</p>
        <h1 class="title">{{ missionTitle }}</h1>
      </div>
      <span class="status-pill" :data-tone="state.status === 'finished' ? state.outcome : state.status">
        {{ statusLabel }}
      </span>
    </div>

    <button
      type="button"
      class="ring-wrap"
      :disabled="state.status === 'finished'"
      :aria-label="state.status === 'idle' ? 'Start mission' : 'Elapsed time'"
      @click="onRingActivate"
    >
      <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="ring-track" cx="100" cy="100" :r="RADIUS" />
        <circle
          class="ring-progress"
          :data-tone="state.outcome === 'failed' ? 'failed' : 'default'"
          cx="100"
          cy="100"
          :r="RADIUS"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <span class="ring-center">
        <span class="ring-label">Total Time</span>
        <span class="ring-time">{{ formatDuration(state.elapsedMs) }}</span>
      </span>
    </button>

    <p v-if="state.status === 'running'" class="ring-hint">
      Tap anywhere on this card when a gate is passed — except Emergency Stop
    </p>

    <!-- Gate 4 drop-result menu — only shown once the trial is over -->
    <div v-if="state.status === 'finished'" class="drop-result">
      <p class="drop-result-label">Gate 4 · Drop Result</p>
      <div class="drop-options">
        <button
          v-for="opt in dropOptions"
          :key="opt.value"
          type="button"
          class="drop-btn"
          :data-tone="opt.tone"
          :data-active="state.dropResult === opt.value"
          @click="onDropSelect(opt.value)"
        >
          <span class="drop-btn-icon">{{ opt.icon }}</span>
          <span class="drop-btn-label">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <button
      type="button"
      class="cta"
      :class="{ 'cta-danger': actionButton.variant === 'danger', 'cta-ghost': actionButton.variant === 'ghost' }"
      @click="actionButton.handler"
    >
      {{ actionButton.label }}
    </button>

    <ul v-if="state.status !== 'idle'" class="waypoints">
      <li
        v-for="(wp, index) in state.waypoints"
        :key="wp.id"
        class="wp-row"
        :data-state="rowState(wp, index)"
      >
        <div class="wp-main">
          <span class="wp-index">
            <template v-if="wp.status === 'success'">✓</template>
            <template v-else-if="wp.status === 'failed'">✕</template>
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="wp-label">{{ wp.label }}</span>
          <span class="wp-time">{{ wp.timeMs != null ? formatDuration(wp.timeMs) : '--:--.--' }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 20px 18px 24px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.panel[data-armed='true'] {
  cursor: pointer;
  border-color: var(--accent-dim);
  box-shadow: 0 0 0 1px rgba(226, 144, 63, 0.12) inset;
}

/* The Emergency Stop button is the one tap target inside an armed panel
   that must not look or behave like "tap anywhere" — it keeps its own
   cursor and stays visually a distinct, deliberate control. */
.panel[data-armed='true'] .cta-danger {
  cursor: pointer;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 6px;
}

.title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.status-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-panel-raised);
  color: var(--accent-strong);
  border: 1px solid var(--line-strong);
  white-space: nowrap;
}
.status-pill[data-tone='success'] {
  color: #e8b878;
  border-color: var(--accent-dim);
}
.status-pill[data-tone='failed'] {
  color: #e58a70;
  border-color: var(--danger);
}

.ring-wrap {
  display: block;
  position: relative;
  width: min(260px, 72vw);
  aspect-ratio: 1 / 1;
  margin: 28px auto 8px;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease;
}
.ring-wrap:hover:not(:disabled) .ring-progress {
  stroke: var(--accent-strong);
}
.ring-wrap:active:not(:disabled) {
  transform: scale(0.985);
}
.ring-wrap:disabled {
  cursor: default;
}

.ring-hint {
  margin: 0 0 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}

.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: var(--bg-panel-raised);
  stroke-width: 10;
}

.ring-progress {
  fill: none;
  stroke: var(--accent);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.35s ease;
}
.ring-progress[data-tone='failed'] {
  stroke: var(--danger);
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ring-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.ring-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: clamp(30px, 8vw, 40px);
  font-weight: 600;
  color: var(--text-primary);
}

/* Gate 4 drop-result menu */
.drop-result {
  margin: 20px 0 8px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-row);
}

.drop-result-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 10px;
}

.drop-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.drop-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--bg-panel-raised);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.drop-btn:hover {
  border-color: var(--accent-dim);
  color: var(--text-primary);
}
.drop-btn-icon {
  font-size: 16px;
}

.drop-btn[data-active='true'] {
  background: var(--accent);
  color: #1b1006;
  border-color: var(--accent);
}
.drop-btn[data-tone='warn'][data-active='true'] {
  background: var(--accent-dim);
  color: #1b1006;
  border-color: var(--accent-dim);
}
.drop-btn[data-tone='danger'][data-active='true'] {
  background: var(--danger);
  color: #fbe9e2;
  border-color: var(--danger);
}

.cta {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 16px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #1b1006;
  font-size: 16px;
  font-weight: 700;
  transition: background 0.15s ease, transform 0.1s ease;
}
.cta:hover {
  background: var(--accent-strong);
}
.cta:active {
  transform: scale(0.99);
}
.cta-ghost {
  background: transparent;
  border: 1px solid var(--line-strong);
  color: var(--text-primary);
}
.cta-ghost:hover {
  border-color: var(--accent-dim);
  background: var(--bg-panel-raised);
}
.cta-danger {
  background: var(--danger);
  color: #fbe9e2;
}
.cta-danger:hover {
  background: var(--danger-strong);
}

.waypoints {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wp-row {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-row);
  padding: 12px 14px;
}
.wp-row[data-state='active'] {
  border-color: var(--accent-dim);
  background: var(--bg-panel-raised);
}
.wp-row[data-state='success'] {
  opacity: 0.85;
}
.wp-row[data-state='pending'] {
  opacity: 0.55;
}
.wp-row[data-state='failed'] {
  border-color: var(--danger);
}

.wp-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wp-index {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
  color: var(--text-secondary);
}
.wp-row[data-state='active'] .wp-index {
  background: var(--accent);
  border-color: var(--accent);
  color: #1b1006;
}
.wp-row[data-state='success'] .wp-index {
  color: var(--accent-strong);
  border-color: var(--accent-dim);
}
.wp-row[data-state='failed'] .wp-index {
  color: var(--danger-strong);
  border-color: var(--danger);
}

.wp-label {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.wp-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text-secondary);
}
</style>