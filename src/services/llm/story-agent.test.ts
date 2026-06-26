import { describe, expect, it, vi } from 'vitest'
import { generateStoryEvents } from './story-agent'
import type { StoryAgentInput } from './story-agent'

vi.mock('@/services/llm/client', () => ({
  createLLMClient: vi.fn(() => ({})),
  getModel: vi.fn(() => 'test-model'),
  callLLM: vi.fn(async () => JSON.stringify({
    events: [
      {
        type: 'trade',
        title: '南方商路恢复',
        summary: '经过谈判，南方商路重新开放，贸易开始恢复。',
        detail: '外交官与南方部落达成协议。',
        actor_ids: ['org_1'],
        target_ids: ['region_1'],
        location_region_id: 'region_1',
        importance: 0.7,
        affects: [
          { entity_id: 'org_1', entity_type: 'organization', metrics: ['treasury↑', 'trade_income↑'] },
          { entity_id: 'region_1', entity_type: 'region', metrics: ['grain_output↑'] },
        ],
        tags: ['trade', 'diplomacy'],
      },
    ],
    world_mood: 'optimistic',
    tick_narrative: '贸易恢复带来了希望。',
  })),
}))

vi.mock('@/services/llm/json-repair', () => ({
  parseLLMJSON: vi.fn((raw: string) => JSON.parse(raw)),
}))

describe('generateStoryEvents', () => {
  const baseInput: StoryAgentInput = {
    worldPremise: 'A medieval kingdom.',
    language: 'zh',
    tick: 5,
    world_mood: 'tense',
    organizations: [
      {
        id: 'org_1',
        name: '北境王国',
        type: 'kingdom',
        status: 'stable',
        description: '古老的北方王国',
        custom_metrics: { treasury: 50000, trade_income: 3000 },
        custom_metric_defs: [
          { key: 'treasury', name: '国库', unit: '金币' },
          { key: 'trade_income', name: '贸易收入', unit: '金币/年' },
        ],
      },
    ],
    regions: [
      {
        id: 'region_1',
        name: '王都',
        terrain: 'urban',
        custom_metrics: { grain_output: 50 },
        custom_metric_defs: [
          { key: 'grain_output', name: '粮食产量' },
        ],
      },
    ],
    characters: [],
    recent_events: [],
    pending_commands: [],
  }

  it('returns structured story events with affects', async () => {
    const result = await generateStoryEvents(baseInput)

    expect(result.events).toHaveLength(1)
    expect(result.events[0].type).toBe('trade')
    expect(result.events[0].title).toBe('南方商路恢复')
    expect(result.events[0].affects).toHaveLength(2)
    expect(result.events[0].affects[0].metrics).toContain('treasury↑')
    expect(result.world_mood).toBe('optimistic')
    expect(result.tick_narrative).toBeTruthy()
  })

  it('returns direction-only affects without numbers', async () => {
    const result = await generateStoryEvents(baseInput)
    const affect = result.events[0].affects[0]

    // Metrics should be like "treasury↑", not "treasury+5000"
    for (const metric of affect.metrics) {
      expect(metric).toMatch(/[↑↓]$/)
      expect(metric).not.toMatch(/\d/)
    }
  })

  it('handles empty events gracefully', async () => {
    const { callLLM } = await import('@/services/llm/client')
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      events: [],
      world_mood: 'calm',
      tick_narrative: '世界平静无事。',
    }))

    const result = await generateStoryEvents(baseInput)
    expect(result.events).toHaveLength(0)
    expect(result.world_mood).toBe('calm')
  })
})
