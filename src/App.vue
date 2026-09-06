<script setup>
import { onMounted } from 'vue'
import { useMissionStore } from './store/missionStore.js'
import TimerPanel from './components/TimerPanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'

const { state, startMission, markWaypoint, resetForNewTrial, loadTrialsFromServer } = useMissionStore()

const SYNC_LABEL = {
  loading: 'Syncing…',
  synced: 'Synced',
  offline: 'Local only',
  error: 'Sync error'
}

onMounted(() => {
  loadTrialsFromServer()
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">Mission Timer</span>
      </div>
      <div class="topbar-meta">
        <span v-if="SYNC_LABEL[state.syncStatus]" class="sync-badge" :data-status="state.syncStatus">
          {{ SYNC_LABEL[state.syncStatus] }}
        </span>
        <span class="trial-count">{{ state.trials.length }} trial{{ state.trials.length === 1 ? '' : 's' }} logged</span>
      </div>
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

.topbar-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.trial-count {
  font-size: 12px;
  color: var(--text-faint);
}

.sync-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  color: var(--text-faint);
}
.sync-badge[data-status='synced'] {
  color: var(--accent-strong);
  border-color: var(--accent-dim);
}
.sync-badge[data-status='error'] {
  color: var(--danger-strong);
  border-color: var(--danger);
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