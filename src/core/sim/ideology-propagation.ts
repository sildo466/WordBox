/**
 * 意识形态传播系统
 *
 * 基于传染病模型（SIR）的变体：
 * - 组织可以"感染"新意识形态
 * - 传播路径：盟友 > 贸易伙伴 > 邻居 > 敌人（对抗传播）
 * - 高开放性组织更易接受，高传统度有抗性
 * - 意识形态会随载体性格发生变异
 */

import type { OrgPersonality } from './org-personality'

// ─── 类型定义 ───

export type IdeologyCategory = 'religious' | 'political' | 'economic' | 'cultural' | 'military'

export type Ideology = {
  id: string
  name: string
  category: IdeologyCategory
  core_beliefs: string[]
  appeal: number           // [0, 100] — 基础吸引力
  virulence: number        // [0, 100] — 传播力
  carriers: string[]       // 携带组织 ID
  origin_org_id: string    // 发源组织
  formed_tick: number
  mutations: IdeologyVariant[]
}

export type IdeologyVariant = {
  id: string
  name: string
  carrier_org_id: string
  deviation: number        // [0, 1] — 与原版的偏差程度
  formed_tick: number
}

export type InfectionState = 'susceptible' | 'exposed' | 'infected' | 'immune'

export type OrgIdeologyState = {
  org_id: string
  ideology_id: string | null    // 当前信仰的意识形态
  infection_state: InfectionState
  resistance: number            // [0, 1] — 抗性
  exposure_count: number        // 被暴露次数
  infection_tick: number | null
}

// ─── 常量 ───

const BASE_TRANSMISSION_RATE = 0.15
const EXPOSURE_TO_INFECTION_THRESHOLD = 3 // 暴露次数达到此值才可能感染
const IMMUNITY_DURATION_TICKS = 40
const MUTATION_CHANCE = 0.1
const MUTATION_DEVIATION_RANGE = 0.3

// 关系类型传播系数
const TRANSMISSION_BY_RELATION: Record<string, number> = {
  ally: 1.0,
  trading_partner: 0.7,
  vassal: 0.8,
  overlord: 0.6,
  neutral: 0.3,
  rival: 0.2,
  enemy: 0.15, // 敌对传播（通过对抗）
}

// ─── 意识形态创建 ───

/**
 * 创建新意识形态
 */
export function createIdeology(
  id: string,
  name: string,
  category: IdeologyCategory,
  coreBeliefs: string[],
  originOrgId: string,
  currentTick: number,
): Ideology {
  return {
    id,
    name,
    category,
    core_beliefs: coreBeliefs,
    appeal: 40 + Math.random() * 30,
    virulence: 30 + Math.random() * 40,
    carriers: [originOrgId],
    origin_org_id: originOrgId,
    formed_tick: currentTick,
    mutations: [],
  }
}

// ─── 传播演算 ───

/**
 * 计算意识形态传播
 */
export function propagateIdeology(
  ideologies: Ideology[],
  orgStates: Map<string, OrgIdeologyState>,
  orgs: Array<{
    id: string
    personality?: OrgPersonality
    relations: Array<{ organization_id: string; type: string; strength: number }>
  }>,
  currentTick: number,
): { newInfections: Array<{ org_id: string; ideology_id: string }>; mutations: IdeologyVariant[] } {
  const newInfections: Array<{ org_id: string; ideology_id: string }> = []
  const mutations: IdeologyVariant[] = []

  for (const ideology of ideologies) {
    for (const carrierId of ideology.carriers) {
      const carrierOrg = orgs.find(o => o.id === carrierId)
      if (!carrierOrg) continue

      // 向每个关系组织传播
      for (const rel of carrierOrg.relations) {
        const targetState = orgStates.get(rel.organization_id)
        if (!targetState) continue
        if (targetState.infection_state === 'infected' || targetState.infection_state === 'immune') continue

        const targetOrg = orgs.find(o => o.id === rel.organization_id)
        if (!targetOrg) continue

        // 计算传播概率
        const relationFactor = TRANSMISSION_BY_RELATION[rel.type] ?? 0.3
        const personalityFactor = calcPersonalityTransmissionFactor(targetOrg.personality)
        const virulenceFactor = ideology.virulence / 100

        const transmissionProb = BASE_TRANSMISSION_RATE * relationFactor * personalityFactor * virulenceFactor

        if (Math.random() < transmissionProb) {
          targetState.exposure_count++

          if (targetState.exposure_count >= EXPOSURE_TO_INFECTION_THRESHOLD) {
            // 感染！
            targetState.infection_state = 'infected'
            targetState.ideology_id = ideology.id
            targetState.infection_tick = currentTick
            ideology.carriers.push(rel.organization_id)
            newInfections.push({ org_id: rel.organization_id, ideology_id: ideology.id })

            // 变异检查
            if (Math.random() < MUTATION_CHANCE) {
              const variant = createMutation(ideology, rel.organization_id, currentTick)
              ideology.mutations.push(variant)
              mutations.push(variant)
            }
          } else {
            targetState.infection_state = 'exposed'
          }
        }
      }
    }
  }

  return { newInfections, mutations }
}

/**
 * 衰减免疫状态
 */
export function decayIdeologyImmunity(
  orgStates: Map<string, OrgIdeologyState>,
  currentTick: number,
): void {
  for (const [, state] of orgStates) {
    if (state.infection_state === 'immune' && state.infection_tick != null) {
      if (currentTick - state.infection_tick >= IMMUNITY_DURATION_TICKS) {
        state.infection_state = 'susceptible'
        state.infection_tick = null
        state.exposure_count = 0
      }
    }
  }
}

// ─── 辅助函数 ───

function calcPersonalityTransmissionFactor(personality?: OrgPersonality): number {
  if (!personality) return 1.0

  // 高开放性 → 更易接受
  // 高传统度 → 更有抗性
  const opennessFactor = 0.5 + (personality.openness / 100) * 0.8
  const traditionResistance = 1 - (personality.tradition / 100) * 0.5

  return opennessFactor * traditionResistance
}

function createMutation(ideology: Ideology, carrierOrgId: string, currentTick: number): IdeologyVariant {
  const deviation = Math.random() * MUTATION_DEVIATION_RANGE
  return {
    id: `variant_${ideology.id}_${carrierOrgId}_${currentTick}`,
    name: `${ideology.name}（${carrierOrgId}变体）`,
    carrier_org_id: carrierOrgId,
    deviation,
    formed_tick: currentTick,
  }
}

/**
 * 格式化意识形态为 LLM 上下文
 */
export function formatIdeologiesForLLM(
  ideologies: Ideology[],
  allOrgs: Array<{ id: string; name: string }>,
): string {
  if (ideologies.length === 0) return '当前世界没有显著的意识形态运动'

  const lines = ideologies.map(ideology => {
    const carrierNames = ideology.carriers
      .map(id => allOrgs.find(o => o.id === id)?.name ?? id)
      .join('、')
    return `- ${ideology.name}（${ideology.category}）：${ideology.core_beliefs.join('、')} | 传播力:${ideology.virulence.toFixed(0)} 信仰者:[${carrierNames}]`
  })

  return `世界意识形态：\n${lines.join('\n')}`
}
