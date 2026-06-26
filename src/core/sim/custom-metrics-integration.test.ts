import { describe, expect, it, vi } from 'vitest'
import { runSimulationTick } from './tick'
import type { WorldState } from '@/core/sim/world-state'
import type { WorldSnapshot } from '@/core/world'
import { snapshotToWorldState } from '@/core/world'
import { createOrganization } from './organization'
import { createSimCharacter } from './character'
import { createRegion } from './region'
import { executeCustomFormulas } from './formula-engine'
import type { MetricDefinition } from './metric-schema'

// Mock all LLM agents
vi.mock('@/services/llm/story-agent', () => ({
  generateStoryEvents: vi.fn(async (input: any) => {
    // Generate events that affect custom metrics
    const org = input.organizations[0]
    if (!org) return { events: [], world_mood: 'calm', tick_narrative: '平静的一天。' }

    return {
      events: [
        {
          type: 'trade',
          title: '贸易繁荣',
          summary: '商队带来大量财富。',
          actor_ids: [org.id],
          target_ids: [],
          importance: 0.7,
          affects: [
            { entity_id: org.id, entity_type: 'organization', metrics: ['treasury↑', 'food_supply↑'] },
          ],
          tags: ['trade'],
        },
      ],
      world_mood: 'prosperous',
      tick_narrative: '贸易带来了繁荣。',
    }
  }),
}))

vi.mock('@/services/llm/data-agent', () => ({
  generateDataChanges: vi.fn(async (input: any) => {
    const changes = []
    for (const event of input.story_events) {
      for (const affect of event.affects) {
        for (const metricDir of affect.metrics) {
          const key = metricDir.replace(/[↑↓]/g, '')
          const isUp = metricDir.includes('↑')
          changes.push({
            entity_id: affect.entity_id,
            entity_type: affect.entity_type,
            metric_key: key,
            delta: isUp ? 500 : -500,
            reason: '贸易事件',
          })
        }
      }
    }
    return { changes, new_metrics: [], warnings: [] }
  }),
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

vi.mock('@/services/llm/tick-gen', () => ({
  generateTickEvents: vi.fn(async () => ({
    events: [],
    world_mood: 'calm',
    tick_narrative: '',
  })),
}))

function createTestWorld(): WorldSnapshot {
  const org = createOrganization('org_1', '北境王国', 'kingdom')
  org.description = '古老的北方王国'
  org.influence_score = 50
  org.military_strength = 30
  org.economic_power = 60
  org.cohesion = 70
  org.public_reputation = 55
  org.resources = 20
  org.population = 100000

  // Add custom metrics
  const metricDefs: MetricDefinition[] = [
    { key: 'treasury', name: '国库', min: 0, max: 1000000, initial: 50000, unit: '金币' },
    { key: 'food_supply', name: '粮食', min: 0, max: 100, initial: 70, unit: '%' },
    { key: 'unrest', name: '民怨', min: 0, max: 100, initial: 20, unit: '%' },
    { key: 'military_morale', name: '军心', min: 0, max: 100, initial: 65, unit: '%' },
    { key: 'trade_income', name: '贸易收入', min: 0, max: 50000, initial: 3000, unit: '金币/年' },
    { key: 'corruption', name: '腐败', min: 0, max: 100, initial: 15, unit: '%' },
    { key: 'tech_level', name: '科技', min: 0, max: 100, initial: 40, unit: '' },
    { key: 'diplomatic_standing', name: '外交', min: 0, max: 100, initial: 55, unit: '' },
    { key: 'public_order', name: '秩序', min: 0, max: 100, initial: 70, unit: '%' },
    { key: 'infrastructure', name: '基建', min: 0, max: 100, initial: 45, unit: '%' },
  ]

  org.custom_metric_defs = metricDefs
  org.custom_metrics = Object.fromEntries(metricDefs.map(d => [d.key, d.initial]))
  org.custom_formulas = {
    treasury: 'treasury + trade_income * 0.1 - military_strength * 0.5 - corruption * 10',
    food_supply: 'food_supply + infrastructure * 0.1 - population * 0.001 - military_strength * 0.05',
    unrest: 'unrest + 0.3 - food_supply * 0.05 - public_order * 0.02',
    military_morale: 'military_morale + cohesion * 0.05 - unrest * 0.1 - 1',
    trade_income: 'trade_income + economic_power * 0.5 - corruption * 20',
    corruption: 'corruption + 0.5 - cohesion * 0.02',
    tech_level: 'tech_level + economic_power * 0.005',
    diplomatic_standing: 'diplomatic_standing + public_reputation * 0.05 - 0.5',
    public_order: 'public_order - unrest * 0.3 + cohesion * 0.1 - corruption * 0.2',
    infrastructure: 'infrastructure + economic_power * 0.003 - 0.2',
  }

  const region = createRegion('region_1', '王都', 5, 5)
  region.terrain = 'urban'
  region.description = '繁华的都城'
  region.population = 50000
  region.danger_level = 10
  region.prosperity = 60
  region.custom_metric_defs = [
    { key: 'grain_output', name: '粮食产量', min: 0, max: 100, initial: 50 },
    { key: 'public_order', name: '治安', min: 0, max: 100, initial: 60 },
  ]
  region.custom_metrics = { grain_output: 50, public_order: 60 }
  region.custom_formulas = {
    grain_output: 'grain_output + prosperity * 0.05 - danger_level * 0.1',
    public_order: 'public_order - danger_level * 0.3 + prosperity * 0.02',
  }

  const char = createSimCharacter('char_1', '国王')
  char.organization_id = 'org_1'
  char.custom_metric_defs = [
    { key: 'reputation', name: '声望', min: 0, max: 100, initial: 50 },
    { key: 'skill_level', name: '技能', min: 0, max: 100, initial: 40 },
    { key: 'network_strength', name: '人脉', min: 0, max: 100, initial: 30 },
  ]
  char.custom_metrics = { reputation: 50, skill_level: 40, network_strength: 30 }

  const snapshot: WorldSnapshot = {
    world_id: 'test-world',
    title: 'Test World',
    tick: 0,
    time: new Date(0).toISOString(),
    config: { language: 'zh' },
    environment: { description: 'A medieval kingdom under threat.' },
    social_context: { macro_events: [], narratives: [], pressures: [], institutions: [], ambient_noise: [] },
    agents: {
      director: { kind: 'world', id: 'director-1' },
      creator: { kind: 'persona', id: 'creator-1' },
      personal: {
        kind: 'personal',
        life_status: 'alive',
        id: 'default-user',
        name: 'user',
        short_term: [],
        long_term: [],
        condition: { energy: 0.65, stress: 0.25, sleep_debt: 0.15, focus: 0.55, aging_index: 0.05 },
        emotion: { label: 'calm', intensity: 0.15 },
        traits: { openness: 0.55, stability: 0.45, attachment: 0.5, agency: 0.5, empathy: 0.5 },
        goals: [],
        relations: {},
        history: [],
      },
      social: { kind: 'social', id: 'social-1' },
      npcs: [],
    },
    narratives: { patterns: [], arcs: [], summaries: [], stats: { total_patterns: 0, active_patterns: 0, concluded_patterns: 0, total_arcs: 0, completed_arcs: 0 } },
    events: [],
    relations: {},
    active_hooks: [],
    systems: {},
    characters: [],
    factions: [],
    storyline_presets: [],
    timeline: [],
    world_mood: 'calm',
    god_commands: [],
    regions: [region],
    organizations: [org],
  } as any

  // Add characters to the snapshot
  ;(snapshot as any).characters = [char]

  return snapshot
}

describe('Custom Metrics Integration', () => {
  it('runs a full tick with custom metrics and formulas', async () => {
    const world = createTestWorld()
    const org = (world as any).organizations[0]

    // Verify initial state
    expect(org.custom_metrics.treasury).toBe(50000)
    expect(org.custom_metrics.unrest).toBe(20)
    expect(org.custom_metric_defs.length).toBe(10)

    // Run a tick
    const result = await runSimulationTick({ world })
    const nextWorld = result.world as any

    // Verify tick advanced (WorldSnapshot has .tick, WorldState has .time.tick)
    const nextTick = nextWorld.tick ?? nextWorld.time?.tick
    expect(nextTick).toBe(1)

    // Verify custom metrics were modified by data agent
    const nextOrg = (nextWorld.organizations ?? nextWorld.factions ?? [])[0]
    expect(nextOrg).toBeDefined()

    // The data agent should have modified treasury and food_supply
    // (from the mock story event affects)
    expect(nextOrg.custom_metrics).toBeDefined()
  })

  it('executes custom formulas correctly', () => {
    const metrics: MetricDefinition[] = [
      { key: 'treasury', name: '国库', min: 0, max: 1000000, initial: 50000 },
      { key: 'food_supply', name: '粮食', min: 0, max: 100, initial: 70 },
      { key: 'unrest', name: '民怨', min: 0, max: 100, initial: 20 },
    ]

    const formulas = {
      treasury: 'treasury + trade_income * 0.1 - military_strength * 0.5',
      food_supply: 'food_supply - population * 0.001 + 1',
      unrest: 'unrest + 0.3 - food_supply * 0.05',
    }

    const current = { treasury: 50000, food_supply: 70, unrest: 20 }
    const external = { trade_income: 3000, military_strength: 30, population: 100000 }

    const result = executeCustomFormulas(metrics, formulas, current, external)

    // treasury: 50000 + 3000*0.1 - 30*0.5 = 50000 + 300 - 15 = 50285
    expect(result.treasury).toBeCloseTo(50285, 0)
    // food_supply: 70 - 100000*0.001 + 1 = 70 - 100 + 1 = -29 → clamped to 0
    expect(result.food_supply).toBe(0)
    // unrest: 20 + 0.3 - 70*0.05 = 20 + 0.3 - 3.5 = 16.8
    expect(result.unrest).toBeCloseTo(16.8, 0)
  })

  it('custom metrics have both increases and decreases over multiple ticks', () => {
    const metrics: MetricDefinition[] = [
      { key: 'value', name: '值', min: 0, max: 100, initial: 50 },
    ]

    // Formula with both growth and decay
    const formulas = {
      value: 'value + 2 - value * 0.05',
    }

    let current = { value: 50 }
    const values: number[] = [50]

    // Run 20 ticks
    for (let i = 0; i < 20; i++) {
      current = executeCustomFormulas(metrics, formulas, current)
      values.push(current.value)
    }

    // Check that values are not monotonic
    // At 50: +2 - 2.5 = -0.5 (decreasing)
    // Should converge toward equilibrium: value = 2 / 0.05 = 40
    expect(values[values.length - 1]).toBeLessThan(values[0]) // decreased from initial
    expect(values[values.length - 1]).toBeGreaterThan(0) // didn't hit floor
    expect(values[values.length - 1]).toBeLessThan(50) // converged below initial
  })

  it('formula engine handles division by zero gracefully', () => {
    const metrics: MetricDefinition[] = [
      { key: 'a', name: 'A', min: 0, max: 100, initial: 10 },
      { key: 'b', name: 'B', min: 0, max: 100, initial: 0 },
    ]

    const formulas = { a: 'a / b' }
    const result = executeCustomFormulas(metrics, formulas, { a: 10, b: 0 })
    expect(result.a).toBe(0) // division by zero returns 0
  })

  it('custom metrics respect min/max bounds', () => {
    const metrics: MetricDefinition[] = [
      { key: 'val', name: 'Val', min: 10, max: 90, initial: 50 },
    ]

    const formulas = { val: 'val + 100' }
    const result = executeCustomFormulas(metrics, formulas, { val: 50 })
    expect(result.val).toBe(90) // clamped to max

    const formulas2 = { val: 'val - 100' }
    const result2 = executeCustomFormulas(metrics, formulas2, { val: 50 })
    expect(result2.val).toBe(10) // clamped to min
  })
})
