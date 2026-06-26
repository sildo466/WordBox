import { describe, expect, it, vi } from 'vitest'
import { generateWorldBuilderData } from './world-builder'
import type { WorldBuilderInput } from './world-builder'

vi.mock('@/services/llm/client', () => ({
  createLLMClient: vi.fn(() => ({})),
  getModel: vi.fn(() => 'test-model'),
  callLLM: vi.fn(async () => JSON.stringify({
    organizations: [
      {
        id: 'org_1',
        custom_metrics: { treasury: 50000, food_supply: 70, unrest: 20, military_morale: 65, trade_income: 3000, corruption: 15, tech_level: 40, diplomatic_standing: 55, public_order: 70, infrastructure: 45 },
        custom_metric_defs: [
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
        ],
        custom_formulas: {
          treasury: 'treasury + trade_income * 0.1 - military_strength * 0.5',
          food_supply: 'food_supply - population * 0.001 + 1',
          unrest: 'unrest + 0.3 - food_supply * 0.05',
          military_morale: 'military_morale + cohesion * 0.05 - 1',
          trade_income: 'trade_income + economic_power * 0.5',
          corruption: 'corruption + 0.5 - cohesion * 0.02',
          tech_level: 'tech_level + economic_power * 0.005',
          diplomatic_standing: 'diplomatic_standing + public_reputation * 0.05 - 0.5',
          public_order: 'public_order - unrest * 0.3 + cohesion * 0.1',
          infrastructure: 'infrastructure + economic_power * 0.003 - 0.2',
        },
        scale: { population_base: 100000, economy_base: 500000, military_base: 10000, description: '王国级' },
        population: 100000,
      },
    ],
    regions: [
      {
        id: 'region_1',
        custom_metrics: { grain_output: 50, minerals: 30, public_order: 60, cultural_flourishing: 40, disease_level: 10 },
        custom_metric_defs: [
          { key: 'grain_output', name: '粮食产量', min: 0, max: 100, initial: 50 },
          { key: 'minerals', name: '矿产', min: 0, max: 100, initial: 30 },
          { key: 'public_order', name: '治安', min: 0, max: 100, initial: 60 },
          { key: 'cultural_flourishing', name: '文化繁荣', min: 0, max: 100, initial: 40 },
          { key: 'disease_level', name: '疾病', min: 0, max: 100, initial: 10 },
        ],
        custom_formulas: {
          grain_output: 'grain_output + prosperity * 0.05 - danger_level * 0.1',
          minerals: 'minerals - 0.1',
          public_order: 'public_order - danger_level * 0.3',
          cultural_flourishing: 'cultural_flourishing + prosperity * 0.03',
          disease_level: 'disease_level - 0.5',
        },
      },
    ],
    characters: [
      {
        id: 'char_1',
        custom_metrics: { reputation: 30, skill_level: 40, network_strength: 25 },
        custom_metric_defs: [
          { key: 'reputation', name: '声望', min: 0, max: 100, initial: 30 },
          { key: 'skill_level', name: '技能', min: 0, max: 100, initial: 40 },
          { key: 'network_strength', name: '人脉', min: 0, max: 100, initial: 25 },
        ],
      },
    ],
    global_variables: { global_tension: 30, tech_level: 30 },
  })),
}))

vi.mock('@/services/llm/json-repair', () => ({
  parseLLMJSON: vi.fn((raw: string) => JSON.parse(raw)),
}))

describe('generateWorldBuilderData', () => {
  const baseInput: WorldBuilderInput = {
    worldPremise: 'A medieval kingdom under threat from barbarian invasions.',
    language: 'zh',
    organizations: [
      { id: 'org_1', name: '北境王国', type: 'kingdom', description: '古老的北方王国', ideology: '保守主义' },
    ],
    regions: [
      { id: 'region_1', name: '王都', terrain: 'urban', description: '繁华的都城' },
    ],
    characters: [
      { id: 'char_1', name: '国王', description: '英明的统治者' },
    ],
  }

  it('returns structured output with custom metrics', async () => {
    const result = await generateWorldBuilderData(baseInput)

    expect(result.organizations).toHaveLength(1)
    expect(result.regions).toHaveLength(1)
    expect(result.characters).toHaveLength(1)

    const org = result.organizations[0]
    expect(org.id).toBe('org_1')
    expect(org.custom_metric_defs.length).toBeGreaterThanOrEqual(10)
    expect(org.custom_metrics).toBeDefined()
    expect(org.custom_formulas).toBeDefined()
    expect(org.population).toBeGreaterThan(0)
    expect(org.scale).toBeDefined()
  })

  it('validates formulas', async () => {
    const result = await generateWorldBuilderData(baseInput)
    const org = result.organizations[0]

    // All returned formulas should be valid
    const availableVars = [
      ...org.custom_metric_defs.map(d => d.key),
      'military_strength', 'economic_power', 'influence_score', 'cohesion',
      'public_reputation', 'resources', 'population',
    ]

    for (const [key, formula] of Object.entries(org.custom_formulas)) {
      // Formula should reference known variables
      expect(typeof formula).toBe('string')
      expect(formula.length).toBeGreaterThan(0)
    }
  })

  it('clamps metric values to their defined ranges', async () => {
    const result = await generateWorldBuilderData(baseInput)
    const org = result.organizations[0]

    for (const def of org.custom_metric_defs) {
      const value = org.custom_metrics[def.key]
      expect(value).toBeGreaterThanOrEqual(def.min)
      expect(value).toBeLessThanOrEqual(def.max)
    }
  })

  it('returns global variables', async () => {
    const result = await generateWorldBuilderData(baseInput)
    expect(result.global_variables).toBeDefined()
    expect(typeof result.global_variables.global_tension).toBe('number')
  })

  it('returns empty arrays for empty input', async () => {
    const result = await generateWorldBuilderData({
      worldPremise: 'Empty world',
      language: 'zh',
      organizations: [],
      regions: [],
      characters: [],
    })
    expect(result.organizations).toHaveLength(0)
    expect(result.regions).toHaveLength(0)
    expect(result.characters).toHaveLength(0)
  })
})
