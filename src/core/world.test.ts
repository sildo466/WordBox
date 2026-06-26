import { describe, expect, it } from 'vitest'
import { createEmptySnapshot } from './world'

describe('createEmptySnapshot', () => {
  it('creates a single-user world with core agents and empty event history', () => {
    const world = createEmptySnapshot()

    expect(world.tick).toBe(0)
    expect(world.agents.director.kind).toBe('world')
    expect(world.agents.creator.kind).toBe('persona')
    expect(world.agents.personal.kind).toBe('personal')
    expect(world.agents.social.kind).toBe('social')
    expect(world.events).toEqual([])
  })

  it('supports pressure-related system snapshots', () => {
    const world = createEmptySnapshot()
    world.systems.world_pressure_profile = {
      generated_at_tick: 1,
      wave: 1,
      dominantPressures: [],
      powerBasis: [],
      distributionPattern: [],
      legitimacyBasis: [],
      faultLines: [],
      volatileZones: [],
      evidenceTrace: [],
    }
    world.systems.situation_snapshot = {
      generated_at_tick: 1,
      wave: 1,
      summaryByAgent: {},
    }

    expect(world.systems.world_pressure_profile?.wave).toBe(1)
    expect(world.systems.situation_snapshot?.generated_at_tick).toBe(1)
  })
})
