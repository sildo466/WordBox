import type { WorldSnapshot } from '@/core/world'
import type { SimEvent, SimEventEffect } from '@/core/sim/event'
import type { ActiveModifier } from '@/core/sim/modifier'
import type { WorldFact } from '@/core/sim/fact'
import type { OrgPersonality } from './org-personality'
import type { OrgReputation } from './org-reputation'
import type { OrgResourcePool } from './org-resources'
import type { OrgTension } from './tension-system'
import { createSimulationEvent } from './utils'
import { executeCustomFormulas } from './formula-engine'
import { createOrgPersonality, inferPersonalityFromType, inferPersonalityFromIdeology, applyOrgPersonalityDrift, deriveStrategyProfile } from './org-personality'
import { createOrgReputation, applyReputationEvent, decayReputation, calcOverallReputation } from './org-reputation'
import { createDefaultResourcePool, calculateResourceGeneration, applyResourceGeneration, calcResourceScarcity, selectResourceStrategy } from './org-resources'
import { createOrgMemoryStore, recordOrgMemory, decayOrgMemory, detectNorms } from './org-memory'
import { evolveTensions, calcTensionImpact, checkTensionTriggers } from './tension-system'

/**
 * 数学引擎 v3 — 原创设计
 *
 * 核心机制（通用游戏设计模式）：
 * 1. 组织间关系评估（多因素）
 * 2. 稳定度/叛乱系统
 * 3. 冲突前置条件
 * 4. 经济循环（生产、消耗、盈余）
 * 5. 权力评级
 * 6. 地区动态
 * 7. 角色 20 属性演算 + 连锁反应
 */

// ─── 常量配置（原创） ───

/** 组织间关系评估因素 */
const RELATION_FACTORS = {
  ally_bonus: 28,
  enemy_penalty: -35,
  trade_partner_bonus: 18,
  territory_diff_scale: 0.4,
  territory_diff_cap: -22,
  adjacent_friction: -18,
  non_adjacent_bonus: 14,
  ideology_match_bonus: 12,
  ideology_mismatch_penalty: -14,
  top_power_penalty: -45,
  power_gap_pressure_divisor: 8,
  interaction_bonus: 6,
}

/** 稳定度因素 */
const STABILITY_FACTORS = {
  capital_bonus: 80,
  protection_period_ticks: 20,
  protection_bonus_per_tick: 4,
  top_power_stability: 60,
  second_power_stability: 35,
  overexpansion_threshold: 2.5,
  overexpansion_penalty_factor: 0.6,
  overexpansion_penalty_cap: -35,
  rebellion_threshold: -25,
  rebellion_chance_factor: 0.008,
}

/** 冲突前置条件 */
const CONFLICT_PREREQUISITES = {
  min_age_ticks: 40,
  min_military_strength: 12,
  cooldown_ticks: 35,
  auto_end_threshold: 8,
}

/** 经济系统 */
const ECONOMY = {
  base_output: 5,
  output_economic_factor: 0.015,
  military_maintenance_factor: 0.015,
  population_cost_factor: 0.005,
  surplus_to_growth_rate: 0.20,
  deficit_to_decline_rate: 0.12,
  military_decay_on_empty: 2.5,
}

/** 势力类型对 influence 衰减的修正（不同类型衰减速率不同） */
const TYPE_INFLUENCE_MODIFIER: Record<string, number> = {
  religious: 0.005,
  merchant: 0.015,
  rebel: 0.02,
  military: 0.005,
  political: 0.01,
  cultural: 0.008,
}

/** 权力评级权重 */
const POWER_WEIGHTS = {
  military: 2.2,
  influence: 0.8,
  economic: 0.6,
  territory: 3.5,
}

/** 自然演算 */
const NATURAL_DECAY = {
  influence_decay_factor: 0.01,
  influence_floor: 0,
  cohesion_decay_per_tick: 0.5,
  cohesion_floor: 0,
  reputation_regression_rate: 0.01,
  reputation_mean: 50,
}

/** 地区动态 */
const REGION = {
  danger_decay_per_tick: 0.6,
  danger_floor: 4,
  prosperity_growth_per_tick: 0.4,
  danger_prosperity_penalty_factor: 0.006,
  population_growth_rate: 0.003,
  controller_economic_bonus_factor: 0.0012,
  controller_military_danger_suppress: 0.001,
}

/** 角色动态 */
const CHARACTER = {
  // 身体
  energy_decay_per_tick: 2,
  energy_recovery_rest: 5,
  health_stress_erosion_factor: 0.05,
  vitality_recovery_base: 0.4,
  vitality_recovery_low_health: 0.1,
  vitality_recovery_critical_health: 0.02,
  aging_rate_base: 0.5,
  aging_health_penalty_threshold: 70,
  aging_health_penalty_factor: 0.1,
  aging_death_threshold: 90,
  aging_death_chance_factor: 0.005,

  // 精神
  stress_growth_per_tick: 1.5,
  stress_rest_reduction: 3,
  stress_morale_relief_threshold: 70,
  stress_morale_relief_factor: 0.1,
  stress_cascade_threshold: 80,
  stress_sanity_loss: 0.3,
  stress_morale_loss: 0.5,
  stress_health_loss: 0.1,
  morale_regression_rate_base: 0.008,
  morale_mean: 55,
  focus_base_from_energy: 0.4,
  focus_stress_penalty: 0.3,
  sanity_breakdown_threshold: 20,

  // 资源
  army_upkeep_per_unit: 0.01,
  retainer_cost_per_unit: 0.05,
  living_cost_base: 0.5,
  living_cost_stress_factor: 0.002,
  wealth_org_salary_factor: 0.005,
  wealth_no_org_decay: 0.3,

  // 社会
  influence_decay_rate: 0.003,
  reputation_regression_rate: 0.002,
  reputation_mean: 10,
  loyalty_cohesion_factor: 0.002,
  loyalty_stress_penalty_threshold: 70,
  loyalty_stress_penalty: 0.2,
  standing_influence_factor: 0.5,
  standing_loyalty_factor: 0.3,
  standing_cohesion_factor: 0.2,

  // 能力
  martial_combat_gain: 0.5,
  martial_peace_decay: 0.1,
  cunning_scheme_gain: 0.3,
  cunning_idle_decay: 0.05,
  charisma_social_gain: 0.2,
  charisma_isolation_decay: 0.05,
  lore_study_gain: 0.3,
  lore_idle_decay: 0.02,

  // 关系
  relation_no_interaction_decay_ticks: 20,
  relation_decay_amount: 0.02,
  relation_enemy_proximity_growth: 0.05,
  relation_ally_interaction_growth: 0.03,
  relation_enemy_stress_bonus: 0.2,
  relation_ally_morale_bonus: 0.1,

  // 欲望
  desire_growth_rate: 0.1,
  desire_decay_rate: 0.05,
  desire_wealth_trigger: 10,
  desire_safety_comfort_threshold_morale: 70,
  desire_safety_comfort_threshold_stress: 30,

  // 叛变
  betrayal_loyalty_threshold: 20,
  betrayal_stress_threshold: 60,
  betrayal_chance_factor: 0.002,
}

// ─── 类型定义 ───

type OrgState = {
  id: string
  name: string
  influence_score: number
  military_strength: number
  economic_power: number
  cohesion: number
  public_reputation: number
  resources: number
  status: string
  ideology?: string
  territory?: string[]
  relations?: Array<{ organization_id: string; type: string; strength: number; notes?: string }>
  founding_tick?: number
  // Phase 1-5 新字段
  personality?: OrgPersonality
  reputation?: OrgReputation
  resource_pool?: OrgResourcePool
  memory?: import('./org-memory').OrgMemoryStore
  treaties?: import('./diplomacy').Treaty[]
  attention_fatigue?: number
  [key: string]: any
}

type RegionState = {
  id: string
  name: string
  danger_level: number
  prosperity: number
  population: number
  controlling_organization_id: string | null
  [key: string]: any
}

type CharState = {
  id: string
  name: string
  // 身体
  vitality: number
  health: number
  energy: number
  stress: number
  aging: number
  // 精神
  morale: number
  focus: number
  sanity: number
  // 社会
  influence: number
  reputation: number
  standing: number
  loyalty: number
  // 资源
  wealth: number
  army: number
  retainers: number
  secrets: number
  // 能力
  martial: number
  cunning: number
  charisma: number
  lore: number
  // 性格
  personality_params?: {
    stability: number
    agency: number
    empathy: number
    attachment: number
    openness: number
  }
  // 其他
  condition?: string
  organization_id?: string
  location_region_id?: string | null
  relations?: Array<{ character_id: string; type: string; strength: number; notes?: string }>
  desires?: Array<{ type: string; description: string; intensity: number }>
  last_action_tick?: number
  last_action_summary?: string
  [key: string]: any
}

// ─── 数学引擎核心 ───

export type MathEngineResult = {
  events: SimEvent[]
  applied_modifiers: number
  summary: string
}

export function runMathEngine(
  world: WorldSnapshot,
  tick: number,
  modifiers: ActiveModifier[],
  facts: WorldFact[],
): MathEngineResult {
  const events: SimEvent[] = []
  let appliedModifiers = 0

  const orgs = getOrganizations(world)
  const regions = getRegions(world)
  const chars = getCharacters(world)

  // 0. 初始化/回填新系统字段
  initializeNewSystems(orgs, tick)

  // 0.1 计算权力评级
  const powerRatings = calcPowerRatings(orgs)

  // 1. 应用 ActiveModifiers（命令持续效果）
  appliedModifiers = applyModifiers(world, modifiers, tick)

  // 2. 组织记忆衰减
  for (const org of orgs) {
    if (org.memory) {
      decayOrgMemory(org.memory, tick)
      detectNorms(org.memory, tick)
    }
  }

  // 3. 经济循环（集成多资源系统）
  const economyEvents = evolveEconomy(orgs, regions, chars, tick, facts)
  events.push(...economyEvents)

  // 4. 组织间关系评估（集成性格系统）
  updateRelations(orgs, powerRatings, tick)

  // 5. 声誉衰减
  for (const org of orgs) {
    if (org.reputation) {
      org.reputation = decayReputation(org.reputation)
    }
  }

  // 6. 稳定度检查（可能导致叛乱）
  const stabilityEvents = checkStability(orgs, powerRatings, tick)
  events.push(...stabilityEvents)

  // 7. 冲突检查
  const conflictEvents = evolveConflicts(orgs, regions, powerRatings, tick)
  events.push(...conflictEvents)

  // 8. 紧张度演算
  const worldAny = world as any
  if (!worldAny._tensions) worldAny._tensions = []
  const tensionResult = evolveTensions(worldAny._tensions, tick)
  worldAny._tensions = tensionResult.tensions
  for (const eruption of tensionResult.eruptions) {
    const impact = calcTensionImpact(eruption)
    // 紧张度影响相关组织
    const sourceOrg = orgs.find(o => o.id === eruption.source_org_id)
    const targetOrg = orgs.find(o => o.id === eruption.target_org_id)
    if (sourceOrg) {
      sourceOrg.cohesion = Math.max(0, sourceOrg.cohesion + impact.cohesion_delta)
      sourceOrg.public_reputation = Math.max(0, sourceOrg.public_reputation + impact.reputation_delta)
      sourceOrg.military_strength = Math.max(0, sourceOrg.military_strength + impact.military_delta)
    }
    if (targetOrg) {
      targetOrg.cohesion = Math.max(0, targetOrg.cohesion + impact.cohesion_delta)
      targetOrg.public_reputation = Math.max(0, targetOrg.public_reputation + impact.reputation_delta)
      targetOrg.military_strength = Math.max(0, targetOrg.military_strength + impact.military_delta)
    }
  }

  // 9. 地区演算
  for (const region of regions) {
    evolveRegion(region, orgs, tick)
  }

  // 10. 角色演算（20 属性完整循环）
  for (const char of chars) {
    const charEvents = evolveCharacter(char, orgs, chars, tick)
    events.push(...charEvents)
  }

  // 11. 组织性格漂移（基于本 tick 事件）
  for (const org of orgs) {
    if (org.personality) {
      // 用近期事件驱动性格漂移
      const orgEvents = events.filter(e =>
        e.actor_ids?.includes(org.id) || e.target_ids?.includes(org.id)
      )
      for (const evt of orgEvents) {
        org.personality = applyOrgPersonalityDrift(org.personality, evt.type, org.cohesion)
      }
    }
  }

  // 12. 组织状态更新
  for (const org of orgs) {
    updateOrgStatus(org)
  }

  // 13. 自定义公式执行（LLM 定义的指标系统）
  const globalVars = worldAny._global_variables ?? {}
  for (const org of orgs) {
    if (org.custom_formulas && org.custom_metric_defs && org.custom_metric_defs.length > 0) {
      const externalVars = {
        military_strength: org.military_strength ?? 0,
        economic_power: org.economic_power ?? 0,
        influence_score: org.influence_score ?? 0,
        cohesion: org.cohesion ?? 0,
        public_reputation: org.public_reputation ?? 0,
        resources: org.resources ?? 0,
        population: org.population ?? 0,
        ...globalVars,
      }
      org.custom_metrics = executeCustomFormulas(
        org.custom_metric_defs,
        org.custom_formulas,
        org.custom_metrics ?? {},
        externalVars,
      )
    }
  }
  for (const region of regions) {
    if (region.custom_formulas && region.custom_metric_defs && region.custom_metric_defs.length > 0) {
      const externalVars = {
        danger_level: region.danger_level ?? 0,
        prosperity: region.prosperity ?? 0,
        population: region.population ?? 0,
        ...globalVars,
      }
      region.custom_metrics = executeCustomFormulas(
        region.custom_metric_defs,
        region.custom_formulas,
        region.custom_metrics ?? {},
        externalVars,
      )
    }
  }
  for (const char of chars) {
    if (char.custom_metric_defs && char.custom_metric_defs.length > 0) {
      const externalVars = buildCharExternalVars(char, globalVars)
      char.custom_metrics = executeCustomFormulas(
        char.custom_metric_defs,
        char.custom_formulas ?? {},
        char.custom_metrics ?? {},
        externalVars,
      )
    }
  }

  return {
    events,
    applied_modifiers: appliedModifiers,
    summary: `数学引擎：${orgs.length}组织、${regions.length}地区、${chars.length}角色演算完成，${appliedModifiers}个modifier已应用`,
  }
}

/** 构建角色自定义公式的外部变量 */
function buildCharExternalVars(char: CharState, globalVars: Record<string, any>): Record<string, number> {
  return {
    vitality: char.vitality ?? 0,
    health: char.health ?? 0,
    energy: char.energy ?? 0,
    stress: char.stress ?? 0,
    aging: char.aging ?? 0,
    morale: char.morale ?? 0,
    focus: char.focus ?? 0,
    sanity: char.sanity ?? 0,
    influence: char.influence ?? 0,
    reputation: char.reputation ?? 0,
    standing: char.standing ?? 0,
    loyalty: char.loyalty ?? 0,
    wealth: char.wealth ?? 0,
    army: char.army ?? 0,
    retainers: char.retainers ?? 0,
    secrets: char.secrets ?? 0,
    martial: char.martial ?? 0,
    cunning: char.cunning ?? 0,
    charisma: char.charisma ?? 0,
    lore: char.lore ?? 0,
    ...globalVars,
  }
}

// ─── 新系统初始化 ───

function initializeNewSystems(orgs: OrgState[], tick: number): void {
  for (const org of orgs) {
    // 初始化性格
    if (!org.personality) {
      const typeDefaults = inferPersonalityFromType(org.type ?? 'other')
      const ideologyDefaults = org.ideology ? inferPersonalityFromIdeology(org.ideology) : {}
      org.personality = createOrgPersonality({ ...typeDefaults, ...ideologyDefaults })
    }

    // 初始化声誉
    if (!org.reputation) {
      org.reputation = createOrgReputation()
    }

    // 初始化多类型资源池
    if (!org.resource_pool) {
      org.resource_pool = createDefaultResourcePool()
    }

    // 初始化记忆
    if (!org.memory) {
      org.memory = createOrgMemoryStore()
    }

    // 初始化条约
    if (!org.treaties) {
      org.treaties = []
    }

    // 初始化注意力疲劳
    if (org.attention_fatigue == null) {
      org.attention_fatigue = 0
    }
  }
}

// ─── 权力评级 ───

function calcPowerRatings(orgs: OrgState[]): Record<string, number> {
  const ratings: Record<string, number> = {}
  for (const org of orgs) {
    ratings[org.id] =
      (org.military_strength ?? 0) * POWER_WEIGHTS.military +
      (org.influence_score ?? 0) * POWER_WEIGHTS.influence +
      (org.economic_power ?? 0) * POWER_WEIGHTS.economic +
      ((org.territory?.length ?? 0)) * POWER_WEIGHTS.territory
  }
  return ratings
}

// ─── 组织间关系评估 ───

function updateRelations(orgs: OrgState[], powerRatings: Record<string, number>, tick: number): void {
  const sortedByPower = [...orgs].sort((a, b) => (powerRatings[b.id] ?? 0) - (powerRatings[a.id] ?? 0))
  const topOrgId = sortedByPower[0]?.id

  for (const org of orgs) {
    if (!org.relations) org.relations = []

    for (const other of orgs) {
      if (org.id === other.id) continue

      let assessment = 0
      const rel = (org.relations ?? []).find(r => r.organization_id === other.id)

      if (rel?.type === 'ally') assessment += RELATION_FACTORS.ally_bonus
      else if (rel?.type === 'enemy') assessment += RELATION_FACTORS.enemy_penalty
      else if (rel?.type === 'trading_partner') assessment += RELATION_FACTORS.trade_partner_bonus

      const myTerritory = org.territory?.length ?? 0
      const theirTerritory = other.territory?.length ?? 0
      const territoryDiff = Math.max(
        RELATION_FACTORS.territory_diff_cap,
        -(myTerritory - theirTerritory) * RELATION_FACTORS.territory_diff_scale,
      )
      assessment += territoryDiff

      if (isAdjacent(org, other)) {
        assessment += RELATION_FACTORS.adjacent_friction
      } else {
        assessment += RELATION_FACTORS.non_adjacent_bonus
      }

      if (org.ideology && other.ideology) {
        assessment += org.ideology === other.ideology
          ? RELATION_FACTORS.ideology_match_bonus
          : RELATION_FACTORS.ideology_mismatch_penalty
      }

      if (other.id === topOrgId && orgs.length >= 3) {
        assessment += RELATION_FACTORS.top_power_penalty
      }

      const myPower = powerRatings[org.id] ?? 0
      const theirPower = powerRatings[other.id] ?? 0
      if (theirPower > myPower) {
        assessment -= (theirPower - myPower) / RELATION_FACTORS.power_gap_pressure_divisor
      }

      if (rel?.type === 'ally' || rel?.type === 'trading_partner') {
        assessment += RELATION_FACTORS.interaction_bonus
      }

      // 性格因素影响关系评估
      if (org.personality && other.personality) {
        const opennessDiff = Math.abs(org.personality.openness - other.personality.openness)
        const aggressionDiff = Math.abs(org.personality.aggression - other.personality.aggression)
        // 相似性格加分，差异大扣分
        assessment += (50 - opennessDiff) * 0.1
        assessment += (50 - aggressionDiff) * 0.08
        // 好战组织对所有人的基础评估更低
        assessment -= (org.personality.aggression - 50) * 0.1
      }

      if (!rel) {
        org.relations.push({
          organization_id: other.id,
          type: 'neutral',
          strength: assessment,
          notes: '',
        })
      } else {
        rel.strength = assessment
      }
    }
  }
}

function isAdjacent(org1: OrgState, org2: OrgState): boolean {
  const t1 = new Set(org1.territory ?? [])
  return (org2.territory ?? []).some(t => t1.has(t))
}

// ─── 稳定度/叛乱系统 ───

function checkStability(orgs: OrgState[], powerRatings: Record<string, number>, tick: number): SimEvent[] {
  const events: SimEvent[] = []

  const sortedByPower = [...orgs].sort((a, b) => (powerRatings[b.id] ?? 0) - (powerRatings[a.id] ?? 0))
  const topOrgId = sortedByPower[0]?.id
  const secondOrgId = sortedByPower[1]?.id

  for (const org of orgs) {
    let stability = 0

    if (org.id === topOrgId) stability += STABILITY_FACTORS.top_power_stability
    else if (org.id === secondOrgId) stability += STABILITY_FACTORS.second_power_stability

    const age = tick - (org.founding_tick ?? 0)
    if (age < STABILITY_FACTORS.protection_period_ticks) {
      stability += (STABILITY_FACTORS.protection_period_ticks - age) * STABILITY_FACTORS.protection_bonus_per_tick
    }

    stability += (org.cohesion ?? 50) * 0.5

    const avgTerritory = orgs.reduce((sum, o) => sum + (o.territory?.length ?? 0), 0) / Math.max(1, orgs.length)
    const myTerritory = org.territory?.length ?? 0
    if (avgTerritory > 0 && myTerritory > avgTerritory * STABILITY_FACTORS.overexpansion_threshold) {
      const penalty = Math.max(
        STABILITY_FACTORS.overexpansion_penalty_cap,
        -(myTerritory - avgTerritory * STABILITY_FACTORS.overexpansion_threshold) * STABILITY_FACTORS.overexpansion_penalty_factor,
      )
      stability += penalty
    }

    if (stability < STABILITY_FACTORS.rebellion_threshold && orgs.length > 1) {
      const rebellionChance = Math.abs(stability - STABILITY_FACTORS.rebellion_threshold) * STABILITY_FACTORS.rebellion_chance_factor
      if (Math.random() < rebellionChance) {
        events.push(createSimulationEvent({
          type: 'rebellion',
          title: `${org.name} 爆发叛乱`,
          summary: `内部矛盾激化，叛军崛起。`,
          detail: `${org.name} 的稳定度降至 ${stability.toFixed(0)}，内部势力发动叛乱，组织面临分裂危机。`,
          actor_ids: [org.id],
          importance: 0.85,
          effects: [
            { target_type: 'organization', target_id: org.id, field: 'cohesion', delta: -15, description: '叛乱削弱凝聚力' },
            { target_type: 'organization', target_id: org.id, field: 'military_strength', delta: -10, description: '叛乱消耗军力' },
            { target_type: 'organization', target_id: org.id, field: 'influence_score', delta: -8, description: '叛乱损害影响力' },
          ],
          tags: ['rebellion', 'internal'],
        }, tick, 'world_director'))
      }
    }
  }

  return events
}

// ─── 冲突系统 ───

function evolveConflicts(
  orgs: OrgState[],
  regions: RegionState[],
  powerRatings: Record<string, number>,
  tick: number,
): SimEvent[] {
  const events: SimEvent[] = []

  for (const org of orgs) {
    const enemies = (org.relations ?? []).filter(r => r.type === 'enemy')
    for (const enemyRel of enemies) {
      const enemy = orgs.find(o => o.id === enemyRel.organization_id)
      if (!enemy) continue

      const orgAge = tick - (org.founding_tick ?? 0)
      const enemyAge = tick - (enemy.founding_tick ?? 0)
      if (orgAge < CONFLICT_PREREQUISITES.min_age_ticks || enemyAge < CONFLICT_PREREQUISITES.min_age_ticks) continue
      if ((org.military_strength ?? 0) < CONFLICT_PREREQUISITES.min_military_strength) continue
      if ((enemy.military_strength ?? 0) < CONFLICT_PREREQUISITES.min_military_strength) continue

      const orgPower = powerRatings[org.id] ?? 0
      const enemyPower = powerRatings[enemy.id] ?? 0
      const totalPower = orgPower + enemyPower
      if (totalPower === 0) continue

      const orgAdvantage = orgPower / totalPower
      const winner = Math.random() < orgAdvantage ? org : enemy
      const loser = winner.id === org.id ? enemy : org

      const intensityFactor = 0.4 + Math.random() * 0.6
      events.push(createSimulationEvent({
        type: 'battle',
        title: `${org.name} 与 ${enemy.name} 爆发冲突`,
        summary: `${winner.name} 在冲突中占据优势。`,
        detail: `${org.name} 和 ${enemy.name} 之间的敌对关系激化为武装冲突。${winner.name} 凭借${orgPower > enemyPower ? '实力优势' : '战术灵活'}取得上风。`,
        actor_ids: [org.id, enemy.id],
        importance: 0.75,
        effects: [
          { target_type: 'organization', target_id: loser.id, field: 'military_strength', delta: -Math.round(7 * intensityFactor), description: `${loser.name} 军力重创` },
          { target_type: 'organization', target_id: winner.id, field: 'military_strength', delta: -Math.round(2 * intensityFactor), description: `${winner.name} 军力损耗` },
          { target_type: 'organization', target_id: loser.id, field: 'influence_score', delta: -4, description: `${loser.name} 影响力下降` },
          { target_type: 'organization', target_id: winner.id, field: 'influence_score', delta: 2, description: `${winner.name} 影响力提升` },
          { target_type: 'organization', target_id: loser.id, field: 'cohesion', delta: -4, description: `${loser.name} 凝聚力下降` },
        ],
        tags: ['conflict', 'battle'],
      }, tick, 'world_director'))

      if ((loser.influence_score ?? 0) < CONFLICT_PREREQUISITES.auto_end_threshold) {
        events.push(createSimulationEvent({
          type: 'negotiation',
          title: `${org.name} 与 ${enemy.name} 停战`,
          summary: `${loser.name} 无力继续战斗，被迫接受和平。`,
          detail: `${loser.name} 的影响力已跌至谷底，无力支撑冲突，双方签署停战协议。`,
          actor_ids: [org.id, enemy.id],
          importance: 0.65,
          effects: [
            { target_type: 'organization', target_id: loser.id, field: 'public_reputation', delta: -2, description: `${loser.name} 声望受损` },
          ],
          tags: ['peace', 'treaty'],
        }, tick, 'world_director'))

        const rel = org.relations?.find(r => r.organization_id === enemy.id)
        if (rel) rel.type = 'neutral'
        const enemyRel2 = enemy.relations?.find(r => r.organization_id === org.id)
        if (enemyRel2) enemyRel2.type = 'neutral'
      }
    }
  }

  return events
}

// ─── 经济循环 ───

function evolveEconomy(
  orgs: OrgState[],
  regions: RegionState[],
  chars: CharState[],
  tick: number,
  facts: WorldFact[],
): SimEvent[] {
  const events: SimEvent[] = []

  for (const org of orgs) {
    const economic = org.economic_power ?? 30
    const military = org.military_strength ?? 30
    const population = calcOrgPopulation(org, chars)

    const output = ECONOMY.base_output + economic * ECONOMY.output_economic_factor
    const militaryCost = military * ECONOMY.military_maintenance_factor
    const popCost = population * ECONOMY.population_cost_factor
    const totalCost = militaryCost + popCost
    const netIncome = output - totalCost

    if (typeof org.resources === 'number') {
      org.resources = Math.max(0, org.resources + netIncome)
    }

    // 多资源系统演算
    if (org.resource_pool) {
      const generation = calculateResourceGeneration(
        org.resource_pool, military, economic, population,
        org.territory?.length ?? 0, org.personality,
      )
      org.resource_pool = applyResourceGeneration(org.resource_pool, generation)

      // 资源稀缺度影响凝聚力
      const scarcity = calcResourceScarcity(org.resource_pool)
      if (scarcity > 0.6) {
        org.cohesion = Math.max(0, org.cohesion - scarcity * 0.5)
      }
    }

    if (netIncome > 0) {
      org.economic_power = Math.max(0, economic + netIncome * ECONOMY.surplus_to_growth_rate)
    } else {
      org.economic_power = Math.max(0, economic + netIncome * ECONOMY.deficit_to_decline_rate)
    }

    if ((org.resources ?? 0) <= 0 && military > 8) {
      org.military_strength = Math.max(0, military - ECONOMY.military_decay_on_empty)
    }

    const influence = org.influence_score ?? 50
    const orgType = (org.type ?? 'other').toLowerCase()
    const decayFactor = TYPE_INFLUENCE_MODIFIER[orgType] ?? NATURAL_DECAY.influence_decay_factor
    org.influence_score = Math.max(
      NATURAL_DECAY.influence_floor,
      influence - influence * decayFactor,
    )

    const cohesion = org.cohesion ?? 50
    // 资源紧张时凝聚力衰减更快
    const resourcePressure = (org.resources ?? 50) < 10 ? 0.3 : 0
    // 凝聚力增长因素：军事和经济是基础增长，声望是加速
    const milBoost = Math.min(0.5, (org.military_strength ?? 0) * 0.01)
    const ecoBoost = Math.min(0.5, (org.economic_power ?? 0) * 0.01)
    const repBoost = Math.min(0.3, Math.abs(org.public_reputation ?? 0) * 0.02)
    // 凝聚力回归：低于 50 时回升，高于 50 时衰减
    const regressionToMean = (50 - cohesion) * 0.01
    const cohesionDelta = -0.1 - resourcePressure + milBoost + ecoBoost + repBoost + regressionToMean
    org.cohesion = Math.max(NATURAL_DECAY.cohesion_floor, Math.min(100, cohesion + cohesionDelta))

    const reputation = org.public_reputation ?? 50
    const repDelta = (NATURAL_DECAY.reputation_mean - reputation) * NATURAL_DECAY.reputation_regression_rate
    org.public_reputation = Math.max(0, reputation + repDelta)

    const relevantFacts = facts.filter(f => f.active && f.affected_entities.includes(org.id))
    for (const fact of relevantFacts) {
      if (fact.category === 'technology') {
        org.military_strength = (org.military_strength ?? 30) + 0.3
        org.economic_power = (org.economic_power ?? 30) + 0.2
      }
      if (fact.category === 'military') {
        org.military_strength = (org.military_strength ?? 30) + 0.2
      }
      if (fact.category === 'economic') {
        org.economic_power = (org.economic_power ?? 30) + 0.3
      }
    }

    if (Math.abs(netIncome) > 1.5 || (org.resources ?? 0) <= 5) {
      events.push(createSimulationEvent({
        type: 'trade',
        title: `${org.name} 经济${netIncome > 0 ? '增长' : '衰退'}`,
        summary: `净收入 ${netIncome > 0 ? '+' : ''}${netIncome.toFixed(1)}，资源${(org.resources ?? 0).toFixed(0)}`,
        detail: `${org.name} 经济运行：产出 ${output.toFixed(1)}，军事维护 ${militaryCost.toFixed(1)}，人口消耗 ${popCost.toFixed(1)}。${(org.resources ?? 0) <= 5 ? '资源即将耗竭！' : ''}`,
        actor_ids: [org.id],
        importance: Math.abs(netIncome) > 3 ? 0.5 : 0.3,
        effects: [],
        tags: ['economy', netIncome > 0 ? 'growth' : 'decline'],
      }, tick, 'world_director'))
    }
  }

  // ─── 实力差距驱动的 influence 转移（零和博弈感）───
  if (orgs.length >= 2) {
    const totalInfluence = orgs.reduce((s, o) => s + (o.influence_score ?? 0), 0)
    const avgInfluence = totalInfluence / orgs.length
    for (const org of orgs) {
      const inf = org.influence_score ?? 0
      if (inf > avgInfluence * 1.1) {
        org.influence_score = inf + (inf - avgInfluence) * 0.02
      } else if (inf < avgInfluence * 0.9) {
        org.influence_score = Math.max(0, inf - (avgInfluence - inf) * 0.015)
      }
    }
  }

  return events
}

function calcOrgPopulation(org: OrgState, chars: CharState[]): number {
  // 优先用 LLM 设定的人口值
  if (org.population && org.population > 10) return org.population
  // 基于势力规模推算人口：军事 + 经济 + 影响力的综合
  const mil = org.military_strength ?? 30
  const eco = org.economic_power ?? 30
  const inf = org.influence_score ?? 50
  const basePop = Math.round(mil * 10 + eco * 5 + inf * 2)
  // 加上实际成员数的加成
  const memberBonus = chars.filter(c => c.organization_id === org.id).length * 100
  return Math.max(100, basePop + memberBonus)
}

// ─── 地区演算 ───

function evolveRegion(region: RegionState, orgs: OrgState[], tick: number): void {
  const danger = region.danger_level ?? 10
  region.danger_level = Math.max(REGION.danger_floor, danger - REGION.danger_decay_per_tick)

  const prosperity = region.prosperity ?? 50
  const dangerPenalty = danger * REGION.danger_prosperity_penalty_factor
  region.prosperity = Math.max(0, prosperity + REGION.prosperity_growth_per_tick - dangerPenalty)

  const population = region.population ?? 100
  if (typeof population === 'number' && population > 0) {
    region.population = Math.max(1, Math.round(population * (1 + REGION.population_growth_rate)))
  }

  const controllerId = region.controlling_organization_id
  if (controllerId) {
    const controller = orgs.find(o => o.id === controllerId)
    if (controller) {
      region.prosperity = region.prosperity + (controller.economic_power ?? 30) * REGION.controller_economic_bonus_factor
      region.danger_level = Math.max(REGION.danger_floor, region.danger_level - (controller.military_strength ?? 30) * REGION.controller_military_danger_suppress)
    }
  }
}

// ─── 角色演算（20 属性完整循环）───

function evolveCharacter(char: CharState, orgs: OrgState[], chars: CharState[], tick: number): SimEvent[] {
  const events: SimEvent[] = []
  const pp = char.personality_params ?? { stability: 50, agency: 50, empathy: 50, attachment: 50, openness: 50 }

  // ── 步骤 1: 身体基础 ──

  // 个性化系数
  const stabilityFactor = pp.stability / 100
  const agencyFactor = pp.agency / 100
  const empathyFactor = pp.empathy / 100
  const attachmentFactor = pp.attachment / 100
  const opennessFactor = pp.openness / 100
  const jitter = () => 0.85 + Math.random() * 0.3 // ±15% 随机扰动

  // 衰老（±噪声）
  char.aging = (char.aging ?? 20) + CHARACTER.aging_rate_base * jitter()

  // 体力消耗（agency 高的人更有活力，衰减更慢）
  const energyDecay = CHARACTER.energy_decay_per_tick * (1.2 - agencyFactor * 0.4) * jitter()
  char.energy = clamp0(100, (char.energy ?? 70) - energyDecay)

  // 压力侵蚀健康
  const stressErosion = (char.stress ?? 20) / 100 * CHARACTER.health_stress_erosion_factor
  char.health = clamp0(100, (char.health ?? 80) - stressErosion)

  // 衰老损害健康
  if (char.aging > CHARACTER.aging_health_penalty_threshold) {
    const agingPenalty = (char.aging - CHARACTER.aging_health_penalty_threshold) * CHARACTER.aging_health_penalty_factor
    char.health = clamp0(100, char.health - agingPenalty)
  }

  // 生命力恢复（受健康制约）
  let recoveryRate = CHARACTER.vitality_recovery_base
  if (char.health < 30) recoveryRate = CHARACTER.vitality_recovery_critical_health
  else if (char.health < 50) recoveryRate = CHARACTER.vitality_recovery_low_health
  char.vitality = clamp0(100, (char.vitality ?? 80) + recoveryRate)

  // 衰老死亡判定
  if (char.aging > CHARACTER.aging_death_threshold) {
    const deathChance = (char.aging - CHARACTER.aging_death_threshold) * CHARACTER.aging_death_chance_factor
    if (Math.random() < deathChance && char.vitality < 30) {
      char.status = 'dead' as any
      events.push(createSimulationEvent({
        type: 'betrayal',
        title: `${char.name} 寿终正寝`,
        summary: `年迈的 ${char.name} 在睡梦中安详离世。`,
        detail: `${char.name} 已年逾 ${Math.floor(char.aging)}，生命力耗尽，自然死亡。`,
        actor_ids: [char.id],
        importance: 0.6,
        effects: [],
        tags: ['death', 'natural'],
      }, tick, 'world_director'))
      return events
    }
  }

  // 生命力归零 → 死亡
  if (char.vitality <= 0) {
    char.status = 'dead' as any
    events.push(createSimulationEvent({
      type: 'betrayal',
      title: `${char.name} 陨落`,
      summary: `${char.name} 的生命力耗尽，不幸身亡。`,
      detail: `${char.name} 因健康崩溃、压力过大或外伤导致生命力归零，死亡。`,
      actor_ids: [char.id],
      importance: 0.7,
      effects: [],
      tags: ['death'],
    }, tick, 'world_director'))
    return events
  }

  // ── 步骤 2: 精神循环 ──

  // 提前查找组织（精神循环需要）
  const org = char.organization_id ? orgs.find(o => o.id === char.organization_id) : null

  // 压力增长（stability 高则压力增长慢，agency 高则主动应对压力）
  const stressGrowth = CHARACTER.stress_growth_per_tick * (1.3 - stabilityFactor * 0.5 - agencyFactor * 0.2) * jitter()
  char.stress = clamp0(100, (char.stress ?? 20) + stressGrowth)

  // 高士气减压
  if ((char.morale ?? 55) > CHARACTER.stress_morale_relief_threshold) {
    char.stress = clamp0(100, char.stress - CHARACTER.stress_morale_relief_factor)
  }

  // 压力连锁反应
  if (char.stress > CHARACTER.stress_cascade_threshold) {
    char.sanity = clamp0(100, (char.sanity ?? 80) - CHARACTER.stress_sanity_loss)
    char.morale = clamp0(100, (char.morale ?? 55) - CHARACTER.stress_morale_loss)
    char.health = clamp0(100, char.health - CHARACTER.stress_health_loss)
  }

  // 精神集中力 = f(精力, 压力, 理智)
  const energyFactor = (char.energy ?? 70) / 100
  const stressFactor = 1 - (char.stress ?? 20) / 100
  const sanityFactor = (char.sanity ?? 80) / 100
  char.focus = clamp0(100, (energyFactor * 40 + stressFactor * 30 + sanityFactor * 30))

  // 士气回归（stability 调节回归速率，attachment 高则社交需求强，士气受同伴影响更大）
  const regressionRate = CHARACTER.morale_regression_rate_base * (0.5 + (1 - stabilityFactor) * 1.0)
  const morale = char.morale ?? 55
  // attachment 高的角色在有组织时士气加成，无组织时惩罚
  const attachmentBonus = org ? attachmentFactor * 0.3 : -attachmentFactor * 0.2
  char.morale = clamp0(100, morale + (CHARACTER.morale_mean - morale) * regressionRate + attachmentBonus)

  // 理智归零 → 失控
  if (char.sanity < CHARACTER.sanity_breakdown_threshold) {
    char.condition = 'unhinged'
  }

  // ── 步骤 3: 资源经济 ──


  if (org) {
    // 从组织领取俸禄（受 standing 影响）
    const standingFactor = 1 + (char.standing ?? 1) / 200
    const salary = (org.economic_power ?? 30) * CHARACTER.wealth_org_salary_factor * standingFactor
    char.wealth = (char.wealth ?? 1) + salary
  } else {
    // 无组织：财富自然消耗
    char.wealth = Math.max(0, (char.wealth ?? 1) - CHARACTER.wealth_no_org_decay)
  }

  // 生活成本
  const livingCost = CHARACTER.living_cost_base + (char.stress ?? 20) * CHARACTER.living_cost_stress_factor
  char.wealth = Math.max(0, char.wealth - livingCost)

  // 军队维护
  char.wealth = Math.max(0, char.wealth - (char.army ?? 0) * CHARACTER.army_upkeep_per_unit)
  // 追随者成本
  char.wealth = Math.max(0, char.wealth - (char.retainers ?? 0) * CHARACTER.retainer_cost_per_unit)

  // 赤字 → 压力飙升
  if (char.wealth <= 0) {
    char.stress = clamp0(100, char.stress + 2)
    // 追随者流失
    if ((char.retainers ?? 0) > 0) {
      char.retainers = Math.max(0, char.retainers - 1)
    }
  }

  // ── 步骤 4: 社会动态 ──

  // 影响力变化（agency 高则主动争取影响力，charisma 辅助）
  const charismaFactor = Math.min(1, (char.charisma ?? 1) / 100)
  const influenceGrowth = agencyFactor * 0.02 + charismaFactor * 0.01
  const influenceDecay = CHARACTER.influence_decay_rate * (1 - agencyFactor * 0.5)
  char.influence = Math.max(0, (char.influence ?? 1) * (1 - influenceDecay) + influenceGrowth * jitter())

  // 声望变化（charisma 高则声望增长更快，cunning 辅助社交）
  const cunningFactor = Math.min(1, (char.cunning ?? 1) / 100)
  const repBase = (CHARACTER.reputation_mean - (char.reputation ?? 1)) * CHARACTER.reputation_regression_rate
  const repGrowth = (charismaFactor * 0.03 + cunningFactor * 0.01) * jitter()
  char.reputation = Math.max(0, (char.reputation ?? 1) + repBase + repGrowth)

  // 组织内地位重算
  if (org) {
    char.standing = Math.max(0,
      (char.influence ?? 1) * CHARACTER.standing_influence_factor +
      (char.loyalty ?? 50) * CHARACTER.standing_loyalty_factor +
      (org.cohesion ?? 50) * CHARACTER.standing_cohesion_factor
    )
  }

  // 忠诚度受组织凝聚力影响
  if (org) {
    const cohesionEffect = ((org.cohesion ?? 50) - 50) * CHARACTER.loyalty_cohesion_factor
    let loyaltyDelta = cohesionEffect

    // 高压力扣忠诚
    if ((char.stress ?? 20) > CHARACTER.loyalty_stress_penalty_threshold) {
      loyaltyDelta -= CHARACTER.loyalty_stress_penalty
    }

    // empathy 高的角色更容易维持忠诚
    loyaltyDelta *= (0.5 + pp.empathy / 200)

    char.loyalty = clamp0(100, (char.loyalty ?? 50) + loyaltyDelta)
  }

  // ── 步骤 5: 能力变化 ──

  // 武力：高压力/有军队时训练增长，否则衰减
  if ((char.stress ?? 20) > 50 || (char.army ?? 0) > 0) {
    char.martial = (char.martial ?? 1) + CHARACTER.martial_combat_gain * agencyFactor * jitter()
  } else {
    char.martial = Math.max(0, (char.martial ?? 1) - CHARACTER.martial_peace_decay * jitter())
  }

  // 谋略：高影响力或有秘密时增长
  if ((char.influence ?? 1) > 5 || (char.secrets ?? 0) > 0) {
    char.cunning = (char.cunning ?? 1) + CHARACTER.cunning_scheme_gain * agencyFactor * jitter()
  } else {
    char.cunning = Math.max(0, (char.cunning ?? 1) - CHARACTER.cunning_idle_decay * jitter())
  }

  // 魅力：高士气且有组织社交时增长
  if ((char.morale ?? 55) > 50 && org) {
    char.charisma = (char.charisma ?? 1) + CHARACTER.charisma_social_gain * (0.5 + empathyFactor * 0.5) * jitter()
  } else {
    char.charisma = Math.max(0, (char.charisma ?? 1) - CHARACTER.charisma_isolation_decay * jitter())
  }

  // 学识：高专注且精神稳定时增长
  if ((char.focus ?? 60) > 50 && (char.sanity ?? 80) > 40) {
    char.lore = (char.lore ?? 1) + CHARACTER.lore_study_gain * opennessFactor * jitter()
  } else {
    char.lore = Math.max(0, (char.lore ?? 1) - CHARACTER.lore_idle_decay * jitter())
  }

  // 秘密：高谋略且有阴谋行为时积累
  if ((char.cunning ?? 1) > 10 && (char.stress ?? 20) > 40) {
    char.secrets = (char.secrets ?? 0) + 0.05 * agencyFactor * jitter()
  }

  // ── 步骤 6: 资源衰减与流失 ──

  // 军队流失（无组织且财富不足）
  if (!org && (char.army ?? 0) > 0 && char.wealth < 5) {
    char.army = Math.max(0, char.army - 1)
  }

  // 追随者流失（声望太低或忠诚太低）
  if ((char.retainers ?? 0) > 0) {
    if ((char.reputation ?? 1) < 10 || (char.loyalty ?? 50) < 20) {
      char.retainers = Math.max(0, char.retainers - 1)
    }
  }

  // ── 步骤 7: 角色间关系动态 ──

  if (char.relations && char.relations.length > 0) {
    for (const relation of char.relations) {
      const other = chars.find(c => c.id === relation.character_id)
      if (!other || other.status !== 'alive') continue

      // 同区域敌对关系 → 压力增加、关系强化
      if (relation.type === 'enemy' && other.location_region_id === char.location_region_id) {
        char.stress = clamp0(100, char.stress + CHARACTER.relation_enemy_stress_bonus)
        relation.strength = Math.min(1, relation.strength + CHARACTER.relation_enemy_proximity_growth)
      }

      // 同组织盟友互动 → 士气提振
      if ((relation.type === 'ally' || relation.type === 'friend') &&
          other.organization_id === char.organization_id &&
          (other.morale ?? 55) > 70) {
        char.morale = clamp0(100, char.morale + CHARACTER.relation_ally_morale_bonus)
        relation.strength = Math.min(1, relation.strength + CHARACTER.relation_ally_interaction_growth)
      }

      // 长期不互动 → 关系淡化
      const otherLastAction = other.last_action_tick ?? 0
      if (tick - otherLastAction > CHARACTER.relation_no_interaction_decay_ticks) {
        relation.strength = Math.max(-1, relation.strength - CHARACTER.relation_decay_amount)
      }
    }
  }

  // 孤立检测
  const allyCount = (char.relations ?? []).filter(r => r.type === 'ally' || r.type === 'friend').length
  if (allyCount === 0 && (char.influence ?? 1) < 5) {
    char.morale = clamp0(100, char.morale - 0.3)
  }

  // ── 步骤 8: 欲望动态 ──

  if (char.desires && char.desires.length > 0) {
    for (const desire of char.desires) {
      // 穷了 → 财富欲望飙升
      if (desire.type === 'wealth' && char.wealth < CHARACTER.desire_wealth_trigger) {
        desire.intensity = Math.min(1, desire.intensity + CHARACTER.desire_growth_rate)
      }
      // 影响力跌落 → 权力欲望飙升
      if (desire.type === 'power' && (char.influence ?? 1) < 10) {
        desire.intensity = Math.min(1, desire.intensity + CHARACTER.desire_growth_rate)
      }
      // 安逸了 → 安全欲望下降
      if (desire.type === 'safety' &&
          (char.morale ?? 55) > CHARACTER.desire_safety_comfort_threshold_morale &&
          (char.stress ?? 20) < CHARACTER.desire_safety_comfort_threshold_stress) {
        desire.intensity = Math.max(0, desire.intensity - CHARACTER.desire_decay_rate)
      }
    }
  }

  // ── 步骤 9: 叛变判定 ──

  if (org && (char.loyalty ?? 50) < CHARACTER.betrayal_loyalty_threshold && (char.stress ?? 20) > CHARACTER.betrayal_stress_threshold) {
    const ambition = char.desires?.find(d => d.type === 'power' || d.type === 'freedom')
    if (ambition && ambition.intensity > 0.6) {
      const chance = (100 - (char.loyalty ?? 50)) * CHARACTER.betrayal_chance_factor * ambition.intensity * ((pp.agency ?? 50) / 100)
      if (Math.random() < chance) {
        // 叛变！
        char.organization_id = undefined
        char.loyalty = 10
        char.stress = clamp0(100, char.stress + 15)
        events.push(createSimulationEvent({
          type: 'betrayal',
          title: `${char.name} 背叛 ${org.name}`,
          summary: `${char.name} 因忠诚崩溃、压力过大而叛离组织。`,
          detail: `${char.name} 的忠诚度降至 ${char.loyalty}，压力高达 ${char.stress}，野心驱使其脱离 ${org.name}。`,
          actor_ids: [char.id],
          target_ids: [org.id],
          importance: 0.7,
          effects: [
            { target_type: 'organization', target_id: org.id, field: 'cohesion', delta: -5, description: '叛逃削弱凝聚力' },
            { target_type: 'organization', target_id: org.id, field: 'influence_score', delta: -3, description: '叛逃损害影响力' },
          ],
          tags: ['betrayal', 'desertion'],
        }, tick, 'world_director'))
      }
    }
  }

  // ── 步骤 10: condition 标签计算 ──

  updateCharacterCondition(char, pp)

  // ── 步骤 11: 趋势计算 ──
  // 用上一 tick 的快照值与当前值比较，生成趋势指示器
  if (!char.trends) char.trends = {}
  const trendAttrs = ['vitality','health','energy','stress','aging','morale','focus','sanity',
    'influence','reputation','standing','loyalty','wealth','army','retainers','secrets',
    'martial','cunning','charisma','lore'] as const
  for (const attr of trendAttrs) {
    const prev = char[`_prev_${attr}`] as number | undefined
    const curr = (char as any)[attr] as number
    if (prev !== undefined && curr !== undefined) {
      const delta = curr - prev
      const threshold = Math.max(0.5, Math.abs(prev) * 0.02) // 至少变化 2% 才算趋势
      char.trends[attr] = delta > threshold ? 'rising' : delta < -threshold ? 'falling' : 'stable'
    } else {
      char.trends[attr] = 'stable'
    }
    // 保存当前值供下一 tick 比较
    ;(char as any)[`_prev_${attr}`] = curr
  }

  return events
}

/** 计算角色当前状态标签 */
function updateCharacterCondition(
  char: CharState,
  pp: { stability: number; agency: number; empathy: number; attachment: number; openness: number },
): void {
  // 已经被步骤 2 或叛变设置了特殊 condition，不覆盖
  if (char.condition === 'unhinged') return

  const vitality = char.vitality ?? 80
  const health = char.health ?? 80
  const stress = char.stress ?? 20
  const morale = char.morale ?? 55
  const loyalty = char.loyalty ?? 50
  const influence = char.influence ?? 1
  const aging = char.aging ?? 20

  if (vitality < 15 || health < 15) {
    char.condition = 'critical'
  } else if (stress > 85) {
    char.condition = 'breaking'
  } else if (stress > 60 && morale < 30) {
    char.condition = 'desperate'
  } else if (loyalty < 20 && char.desires?.some(d => (d.type === 'power' || d.type === 'freedom') && d.intensity > 0.6)) {
    char.condition = 'scheming'
  } else if (aging > 70) {
    char.condition = 'decaying'
  } else {
    const allyCount = (char.relations ?? []).filter(r => r.type === 'ally' || r.type === 'friend').length
    if (allyCount === 0 && influence < 5) {
      char.condition = 'isolated'
    } else if (influence > 60 && morale > 60 && stress < 40) {
      char.condition = 'thriving'
    } else if (morale > 60 && stress < 50) {
      char.condition = 'content'
    } else if (stress > 50 || morale < 40) {
      char.condition = 'struggling'
    } else {
      char.condition = 'content'
    }
  }
}

// ─── 组织状态更新 ───

function updateOrgStatus(org: OrgState): void {
  const influence = org.influence_score ?? 50
  const military = org.military_strength ?? 30
  const cohesion = org.cohesion ?? 50

  if (influence < 15 && military < 10) {
    org.status = 'collapsed'
  } else if (influence < 30 || cohesion < 30) {
    org.status = 'declining'
  } else if (influence > 60 && cohesion > 60) {
    org.status = 'rising'
  } else {
    org.status = 'stable'
  }
}

// ─── Modifier 应用 ───

function applyModifiers(world: WorldSnapshot, modifiers: ActiveModifier[], tick: number): number {
  let applied = 0

  for (const mod of modifiers) {
    if (mod.remaining_ticks <= 0) continue

    const entity = findEntityByModifier(world, mod)
    if (!entity) continue

    const currentValue = typeof entity[mod.field] === 'number' ? entity[mod.field] : 0
    entity[mod.field] = currentValue + mod.delta_per_tick
    mod.remaining_ticks--
    applied++
  }

  return applied
}

function findEntityByModifier(world: WorldSnapshot, mod: ActiveModifier): Record<string, any> | null {
  const w = world as any

  switch (mod.target_type) {
    case 'organization': {
      const orgs = w.organizations ?? w.factions ?? []
      return orgs.find((o: any) => o.id === mod.target_id) ?? null
    }
    case 'character': {
      const chars = w.characters ?? []
      return chars.find((c: any) => c.id === mod.target_id) ?? null
    }
    case 'region': {
      const regions = w.regions ?? []
      return regions.find((r: any) => r.id === mod.target_id) ?? null
    }
    case 'world':
      return w
    default:
      return null
  }
}

// ─── 辅助函数 ───

function clamp0(max: number, value: number): number {
  return Math.max(0, Math.min(max, value))
}

function getOrganizations(world: WorldSnapshot): OrgState[] {
  const w = world as any
  return Array.isArray(w.organizations) ? w.organizations
    : Array.isArray(w.factions) ? w.factions
    : []
}

function getRegions(world: WorldSnapshot): RegionState[] {
  const w = world as any
  return Array.isArray(w.regions) ? w.regions : []
}

function getCharacters(world: WorldSnapshot): CharState[] {
  const w = world as any
  return Array.isArray(w.characters) ? w.characters : []
}

// ─── 性格漂移系统 ───

/** 事件类型 → 性格参数变化的映射 */
const PERSONALITY_DRIFT_MAP: Record<string, Partial<Record<keyof CharState['personality_params'], number>>> = {
  // 战斗/冲突 → 主动性提升，稳定性下降
  battle: { agency: 0.1, stability: -0.05 },
  rebellion: { agency: 0.05, stability: -0.05 },
  // 背叛 → 稳定性下降，共情力下降
  betrayal: { stability: -0.1, empathy: -0.05 },
  // 贸易 → 开放性提升
  trade: { openness: 0.05 },
  // 发现/探索 → 开放性提升
  discovery: { openness: 0.1 },
  // 联盟/谈判 → 共情力提升，社交需求提升
  alliance: { empathy: 0.05, attachment: 0.05 },
  negotiation: { empathy: 0.05, openness: 0.03 },
  // 灾难 → 稳定性下降
  disaster: { stability: -0.05 },
  // 仪式/反思 → 稳定性提升
  ritual: { stability: 0.1 },
  // 谣言 → 开放性微降（怀疑态度）
  rumor: { openness: -0.03 },
  // 迁移 → 开放性提升
  migration: { openness: 0.05, agency: 0.03 },
  // 暗杀 → 稳定性下降
  assassination: { stability: -0.08, empathy: -0.05 },
  // 神命令 → 主动性微降（服从权威）
  god_command: { agency: -0.03 },
}

/**
 * 根据 LLM 生成的事件，对角色性格参数进行漂移
 * 在 LLM 事件生成后、后果应用前调用
 */
export function applyPersonalityDrift(world: WorldSnapshot, events: SimEvent[]): void {
  const chars = getCharacters(world)

  for (const event of events) {
    const drift = PERSONALITY_DRIFT_MAP[event.type]
    if (!drift) continue

    // 找到事件中的角色 actor
    for (const actorId of event.actor_ids ?? []) {
      const char = chars.find(c => c.id === actorId)
      if (!char || !char.personality_params) continue

      // 应用漂移
      for (const [param, delta] of Object.entries(drift)) {
        if (delta == null) continue
        const key = param as keyof typeof char.personality_params
        const current = char.personality_params[key] ?? 50
        char.personality_params[key] = Math.max(0, Math.min(100, current + (delta as number)))
      }
    }

    // 事件目标也受轻微影响（被攻击 → 稳定性下降）
    for (const targetId of event.target_ids ?? []) {
      const char = chars.find(c => c.id === targetId)
      if (!char || !char.personality_params) continue

      // 目标受到的影响通常是 actor 的一半，方向可能相反
      if (event.type === 'battle' || event.type === 'betrayal' || event.type === 'assassination') {
        char.personality_params.stability = Math.max(0, Math.min(100, (char.personality_params.stability ?? 50) - 0.05))
        char.personality_params.empathy = Math.max(0, Math.min(100, (char.personality_params.empathy ?? 50) - 0.03))
      }
      if (event.type === 'alliance' || event.type === 'negotiation') {
        char.personality_params.attachment = Math.max(0, Math.min(100, (char.personality_params.attachment ?? 50) + 0.03))
      }
    }
  }
}
