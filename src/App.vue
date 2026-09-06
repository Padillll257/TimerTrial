<script setup>
import { useMissionStore } from './store/missionStore.js'
import TimerPanel from './components/TimerPanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'

const { state, startMission, markWaypoint, resetForNewTrial } = useMissionStore()
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">Mission Timer</span>
      </div>
      <span class="trial-count">{{ state.trials.length }} trial{{ state.trials.length === 1 ? '' : 's' }} logged</span>
    </header>

    <main class="layout">
      <TimerPanel
        class="col-timer"
        :state="state"
        @start="startMission"
        @mark="markWaypoint"
        @reset="resetForNewTrial"
      />
      <HistoryPanel class="col-history" :state="state" />
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px 16px 40px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(226, 144, 63, 0.15);
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.trial-count {
  font-size: 12px;
  color: var(--text-faint);
}

.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 900px) {
  .layout {
    grid-template-columns: 1.5fr 1fr;
    align-items: start;
  }

  .col-history {
    position: sticky;
    top: 16px;
  }
}
</style>