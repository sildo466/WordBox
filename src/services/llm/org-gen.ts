/**
 * LLM-based organization generator.
 * Creates structured Organization objects from world context.
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { Organization, OrganizationType } from '@/core/sim/organization'
import { createOrganization } from '@/core/sim/organization'

type GenerateOrgsInput = {
  worldPremise: string
  language: string
  count: number
  existingOrgs?: string[]
}

type RawOrganization = {
  name: string
  type: string
  description: string
  ideology: string
  goals: Array<{ description: string; priority: number }>
  territory: string[]
  influence_score: number
  military_strength: number
  economic_power: number
  cohesion: number
  public_reputation: number
}

const VALID_TYPES: OrganizationType[] = [
  'kingdom', 'empire', 'republic', 'tribe', 'guild', 'church',
  'merchant_company', 'criminal_syndicate', 'secret_society', 'mercenary_band', 'other',
]

export async function generateOrganizations(input: GenerateOrgsInput): Promise<Organization[]> {
  const existingHint = input.existingOrgs?.length
    ? `\n已存在的组织（不要重复）：${input.existingOrgs.join('、')}`
    : ''

  const prompt = `你是一个世界构建师。根据以下世界观设定，生成 ${input.count} 个组织/势力。

世界观：
${input.worldPremise}
${existingHint}

每个组织应包含：名称、类型、描述、意识形态、目标(2-3个)、领地、各项数值(0-100)。

组织类型可选：${VALID_TYPES.join('、')}

要求：
1. 组织之间应有互动关系（盟友、敌对、竞争等）
2. 数值应合理分配，不同组织有不同优势
3. 名称和描述应符合世界观风格

请用 JSON 数组格式返回：
[
  {
    "name": "组织名称",
    "type": "类型",
    "description": "描述",
    "ideology": "意识形态",
    "goals": [{"description": "目标描述", "priority": 1}],
    "territory": ["领地1", "领地2"],
    "influence_score": 50,
    "military_strength": 40,
    "economic_power": 60,
    "cohesion": 70,
    "public_reputation": 55
  }
]

语言：${input.language === 'zh' ? '中文' : 'English'}`

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawOrgs = parseLLMJSON<RawOrganization[]>(raw)
    if (!Array.isArray(rawOrgs)) throw new Error('Expected array of organizations')

    return rawOrgs.map((raw, i) => {
      const org = createOrganization(
        `org_${Date.now()}_${i}`,
        raw.name || `组织${i + 1}`,
        (VALID_TYPES.includes(raw.type as OrganizationType) ? raw.type : 'other') as OrganizationType,
      )

      org.description = raw.description || ''
      org.ideology = raw.ideology || ''
      org.goals = (raw.goals ?? []).map((g, gi) => ({
        id: `goal_${i}_${gi}`,
        description: g.description,
        priority: g.priority ?? 1,
        progress: 0,
        status: 'active' as const,
      }))
      org.territory = raw.territory ?? []
      org.influence_score = clamp(raw.influence_score ?? 50, 0, 10000)
      org.military_strength = clamp(raw.military_strength ?? 30, 0, 10000)
      org.economic_power = clamp(raw.economic_power ?? 30, 0, 10000)
      org.cohesion = clamp(raw.cohesion ?? 70, 0, 10000)
      org.public_reputation = clamp(raw.public_reputation ?? 50, 0, 10000)

      return org
    })
  } catch (err) {
    console.error('[organization-generator] LLM generation failed:', err)
    // Return placeholder organizations
    return Array.from({ length: input.count }, (_, i) => {
      const org = createOrganization(`org_fallback_${i}`, `势力${i + 1}`, 'other')
      org.description = '自动生成的势力'
      return org
    })
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
