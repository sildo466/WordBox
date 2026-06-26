import { describe, expect, it, vi } from 'vitest'
import { runSimulationTick } from './tick'
import type { WorldState } from '@/core/sim/world-state'
import type { GodCommand } from '@/core/sim/command'

// Mock the new 3-agent pipeline
vi.mock('@/services/llm/story-agent', () => ({
  generateStoryEvents: vi.fn(async () => ({
    events: [
      {
        type: 'trade',
        title: '南方商路恢复贸易',
        summary: '经过谈判，南方商路重新开放。',
        detail: '外交官与南方部落达成协议。',
        actor_ids: ['o1'],
        target_ids: ['r1'],
        location_region_id: 'r1',
        importance: 0.7,
        affects: [
          { entity_id: 'o1', entity_type: 'organization', metrics: ['treasury↑', 'trade_income↑'] },
        ],
        tags: ['trade'],
      },
    ],
    world_mood: 'optimistic',
    tick_narrative: '贸易恢复带来了希望。',
  })),
}))

vi.mock('@/services/llm/data-agent', () => ({
  generateDataChanges: vi.fn(async () => ({
    changes: [
      { entity_id: 'o1', entity_type: 'organization', metric_key: 'treasury', delta: 5000, reason: '贸易收入' },
      { entity_id: 'o1', entity_type: 'organization', metric_key: 'trade_income', delta: 200, reason: '商路恢复' },
    ],
    new_metrics: [],
    warnings: [],
  })),
}))

vi.mock('@/services/llm/formula-agent', () => ({
  generateFormulaAdjustments: vi.fn(async () => ({
    formula_changes: [],
    new_metrics: [],
    scale_adjustments: [],
    reasoning: 'No changes needed.',
  })),
  shouldTriggerFormulaAgent: vi.fn(() => ({ trigger: false, reason: '' })),
}))

// Also mock the single-agent fallback
vi.mock('@/services/llm/tick-gen', () => ({
  generateTickEvents: vi.fn(async () => ({
    events: [
      {
        type: 'other',
        title: 'Mock world movement',
        summary: 'The world advances under command pressure.',
        detail: 'A mocked tick keeps the test deterministic.',
        actor_ids: [],
        target_ids: ['o1'],
        location_region_id: null,
        importance: 0.6,
        effects: [],
        tags: ['mock'],
      },
    ],
    world_mood: 'tense',
    tick_narrative: 'A command nudges the world forward.',
  })),
}))

function createWorld(): WorldState {
  return {
    id: 'world-1',
    premise: 'A small kingdom under pressure.',
    language: 'zh-CN',
    time: {
      tick: 0,
      day: 1,
      season: 'spring',
      year: 1,
      era_label: 'Year 1',
    },
    regions: ['r1'],
    organizations: ['o1'],
    characters: ['c1'],
    active_crises: [],
    god_commands: [],
    pending_events: [],
    world_mood: 'calm',
    dominant_faction_id: null,
    tick_speed: 'paused',
    config: {
      max_regions: 12,
      max_organizations: 8,
      max_characters: 20,
      auto_tick: false,
      tick_interval_ms: 3000,
    },
  }
}

describe('runSimulationTick', () => {
  it('consumes pending commands and advances the world', async () => {
    const command: GodCommand = {
      id: 'cmd-1',
      raw_input: '让组织行动',
      parsed_intent: '推动组织行动',
      target_type: 'organization',
      target_id: 'o1',
      target_name: 'Guild',
      strength: 'order',
      constraints: [],
      status: 'parsed',
      issued_at_tick: 0,
      resolved_at_tick: null,
      feedback: '',
      generated_event_ids: [],
      refusal_reason: null,
      estimated_ticks: 10,
      progress: 0,
      total_ticks_worked: 0,
      intermediate_results: [],
      narrative_plan: [],
    }

    const result = await runSimulationTick({
      world: createWorld(),
      pendingCommands: [command],
    })

    const nextWorld = result.world as WorldState
    expect(nextWorld.time.tick).toBe(1)
    expect(result.new_events.some(event => event.type === 'god_command')).toBe(true)
    expect(nextWorld.god_commands.length).toBeGreaterThan(0)
  })

  it('uses story agent and data agent for custom metrics', async () => {
    const result = await runSimulationTick({
      world: createWorld(),
    })

    const nextWorld = result.world as WorldState
    expect(nextWorld.time.tick).toBe(1)
    // Should have events from story agent
    expect(result.new_events.length).toBeGreaterThan(0)
    expect(result.tick_narrative).toBeTruthy()
  })

  it('falls back to single-agent when story agent returns no events', async () => {
    const { generateStoryEvents } = await import('@/services/llm/story-agent')
    vi.mocked(generateStoryEvents).mockResolvedValueOnce({
      events: [],
      world_mood: 'calm',
      tick_narrative: '',
    })

    const result = await runSimulationTick({
      world: createWorld(),
    })

    const nextWorld = result.world as WorldState
    expect(nextWorld.time.tick).toBe(1)
    // Should fall back to single-agent generateTickEvents
    expect(result.new_events.length).toBeGreaterThan(0)
  })
})
