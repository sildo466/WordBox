import { describe, expect, it, vi } from 'vitest'
import { generateDataChanges } from './data-agent'
import type { DataAgentInput } from './data-agent'
import type { StoryEvent } from './story-agent'

vi.mock('@/services/llm/client', () => ({
  createLLMClient: vi.fn(() => ({})),
  getModel: vi.fn(() => 'test-model'),
  callLLM: vi.fn(async () => JSON.stringify({
    changes: [
      {
        entity_id: 'org_1',
        entity_type: 'organization',
        metric_key: 'treasury',
        delta: -5000,
        reason: '商路建设投入',
      },
      {
        entity_id: 'org_1',
        entity_type: 'organization',
        metric_key: 'trade_income',
        delta: 800,
        reason: '商路恢复带来贸易增长',
      },
    ],
    warnings: [],
  })),
}))

vi.mock('@/services/llm/json-repair', () => ({
  parseLLMJSON: vi.fn((raw: string) => JSON.parse(raw)),
}))

describe('generateDataChanges', () => {
  const storyEvents: StoryEvent[] = [
    {
      type: 'trade',
      title: '南方商路恢复',
      summary: '商路重新开放。',
      actor_ids: ['org_1'],
      target_ids: ['region_1'],
      importance: 0.7,
      affects: [
        { entity_id: 'org_1', entity_type: 'organization', metrics: ['treasury↓', 'trade_income↑'] },
      ],
      tags: ['trade'],
    },
  ]

  const baseInput: DataAgentInput = {
    tick: 5,
    story_events: storyEvents,
    organizations: [
      {
        id: 'org_1',
        name: '北境王国',
        custom_metrics: { treasury: 50000, trade_income: 3000 },
        custom_metric_defs: [
          { key: 'treasury', name: '国库', min: 0, max: 1000000, initial: 50000, unit: '金币' },
          { key: 'trade_income', name: '贸易收入', min: 0, max: 50000, initial: 3000, unit: '金币/年' },
        ],
        custom_formulas: {},
        influence_score: 50,
        military_strength: 30,
        economic_power: 60,
        cohesion: 70,
        public_reputation: 55,
        resources: 20,
        population: 100000,
      },
    ],
    regions: [],
    characters: [],
  }

  it('returns concrete numerical changes', async () => {
    const result = await generateDataChanges(baseInput)

    expect(result.changes).toHaveLength(2)
    expect(result.changes[0].metric_key).toBe('treasury')
    expect(result.changes[0].delta).toBe(-5000)
    expect(result.changes[1].metric_key).toBe('trade_income')
    expect(result.changes[1].delta).toBe(800)
  })

  it('clamps delta to metric range limits', async () => {
    const { callLLM } = await import('@/services/llm/client')
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      changes: [
        {
          entity_id: 'org_1',
          entity_type: 'organization',
          metric_key: 'trade_income',
          delta: 999999,
          reason: 'extreme value',
        },
      ],
      warnings: [],
    }))

    const result = await generateDataChanges(baseInput)
    // trade_income range is [0, 50000], 10% = 5000, so max delta = 5000
    expect(Math.abs(result.changes[0].delta)).toBeLessThanOrEqual(5000)
  })

  it('generates warnings for boundary proximity', async () => {
    const { callLLM } = await import('@/services/llm/client')
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      changes: [
        {
          entity_id: 'org_1',
          entity_type: 'organization',
          metric_key: 'treasury',
          delta: -45000,
          reason: 'large expense',
        },
      ],
      warnings: [],
    }))

    const result = await generateDataChanges(baseInput)
    expect(result.warnings.some(w => w.includes('treasury'))).toBe(true)
  })

  it('returns empty changes for empty events', async () => {
    const result = await generateDataChanges({
      ...baseInput,
      story_events: [],
    })
    expect(result.changes).toHaveLength(0)
  })
})
