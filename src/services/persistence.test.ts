import { describe, it, expect } from 'vitest'
import { createEmptySnapshot } from '@/core/world'
import { createWorldState } from '@/core/sim/world-state'
import { saveSnapshot, loadSnapshot, saveWorldState, loadWorldState, loadWorldSnapshot } from './persistence'

it('saves and reloads the world slice from disk', async () => {
  const world = createEmptySnapshot()
  await saveSnapshot(world)
  const loaded = await loadSnapshot(world.world_id)
  expect(loaded?.world_id).toBe(world.world_id)
})

it('saves and reloads the world state from disk', async () => {
  const worldState = createWorldState('world-p0-6', 'A test world for persistence', 'zh-CN')
  worldState.god_commands = ['cmd-1']
  worldState.pending_events = ['evt-1']

  await saveWorldState(worldState)

  const loadedState = await loadWorldState(worldState.id)
  const snapshot = await loadWorldSnapshot(worldState.id)

  expect(loadedState?.id).toBe(worldState.id)
  expect(loadedState?.god_commands).toContain('cmd-1')
  expect(snapshot?.world_snapshot.world_id).toBe(worldState.id)
  expect(snapshot?.world_state.pending_events).toContain('evt-1')
})
