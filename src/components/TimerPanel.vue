<script setup>
import { computed } from 'vue'
import { formatDuration } from '../utils/format.js'

const props = defineProps({
  state: { type: Object, required: true }
})
const emit = defineEmits(['start', 'mark', 'reset'])

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

// The ring doubles as the primary control: tap to start when idle, tap to
// log the current gate as passed while running. It does nothing once the
// mission is finished (use "Start New Trial" instead).
function onRingActivate() {
  if (props.state.status === 'idle') {
    emit('start')
  } else if (props.state.status === 'running') {
    emit('mark', 'success')
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
</script>

<template>
  <section class="panel">
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
      :aria-label="state.status === 'idle' ? 'Start mission' : 'Log current gate as passed'"
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

    <p v-if="state.status === 'running'" class="ring-hint">Tap the ring when a gate is passed</p>

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