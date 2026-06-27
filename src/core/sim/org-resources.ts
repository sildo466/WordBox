/**
 * 组织多类型资源系统
 *
 * 六类资源 + 六种博弈策略
 * 策略选择由组织性格驱动，资源分配有先后顺序
 */

import type { OrgPersonality } from './org-personality'

// ─── 类型定义 ───

export type ResourceType = 'treasury' | 'food' | 'materials' | 'manpower' | 'intelligence' | 'political_capital'

export type OrgResourcePool = {
  treasury: number           // 金库
  food: number               // 粮食
  materials: number          // 原材料
  manpower: number           // 人力
  intelligence: number       // 情报资源
  political_capital: number  // 政治资本
}

export type ResourceStrategy =
  | 'direct_compete'  // 正面竞争
  | 'cooperate'       // 合作共赢
  | 'deceive'         // 欺骗策略
  | 'share'           // 分享资源
  | 'hoard'           // 囤积储备
  | 'steal'           // 窃取/掠夺

export type ResourceTransaction = {
  from_org_id: string
  to_org_id: string
  resource_type: ResourceType
  amount: number
  strategy: ResourceStrategy
  success: boolean
  tick: number
}

export type ResourceGeneration = {
  base_rate: number
  territory_bonus: number
  economic_power_bonus: number
  military_upkeep: number
  population_cost: number
  intelligence_upkeep: number
  net: number
}

// ─── 常量 ───

const RESOURCE_CAP = 1000
const RESOURCE_MIN = 0

const BASE_GENERATION: Record<ResourceType, number> = {
  treasury: 5,
  food: 8,
  materials: 4,
  manpower: 2,
  intelligence: 1,
  political_capital: 1,
}

const UPKEEP_COSTS = {
  military_per_unit: 0.15,   // 每点军事力量消耗金库
  population_per_unit: 0.03, // 每点人口消耗粮食
  intelligence_base: 0.5,    // 情报基础维护
  territory_per_unit: 0.2,   // 每块领地消耗原材料
}

const STRATEGY_SUCCESS_RATES: Record<ResourceStrategy, number> = {
  direct_compete: 0.7,
  cooperate: 0.85,
  deceive: 0.4,
  share: 0.95,
  hoard: 1.0,    // 囤积总是成功（自己操作）
  steal: 0.25,
}

const STRATEGY_RESOURCE_GAIN: Record<ResourceStrategy, number> = {
  direct_compete: 1.5,
  cooperate: 1.0,
  deceive: 2.0,
  share: 0.5,
  hoard: 0.3,
  steal: 3.0,
}

// ─── 策略选择 ───

/**
 * 根据组织性格选择资源博弈策略
 */
export function selectResourceStrategy(
  personality: OrgPersonality,
  resourceScarcity: number,  // [0, 1] — 资源稀缺程度
  hasTradePartner: boolean,
): ResourceStrategy {
  const { aggression, openness, pragmatism } = personality

  // 极度稀缺时的紧急策略
  if (resourceScarcity > 0.8) {
    if (aggression > 70) return 'steal'
    if (pragmatism > 60) return 'direct_compete'
    if (openness > 50 && hasTradePartner) return 'cooperate'
  }

  // 常规策略选择
  if (aggression > 75) return 'direct_compete'
  if (aggression > 80 && pragmatism > 60) return 'steal'
  if (openness > 65 && hasTradePartner) return 'cooperate'
  if (openness > 70) return 'share'
  if (pragmatism > 70 && openness < 35) return 'hoard'
  if (pragmatism > 65 && openness < 40) return 'deceive'

  return 'cooperate' // 默认合作
}

// ─── 资源生成 ───

/**
 * 计算组织资源生成
 */
export function calculateResourceGeneration(
  resources: OrgResourcePool,
  militaryStrength: number,
  economicPower: number,
  population: number,
  territoryCount: number,
  personality?: OrgPersonality,
): Record<ResourceType, ResourceGeneration> {
  const result: Partial<Record<ResourceType, ResourceGeneration>> = {}

  for (const type of ['treasury', 'food', 'materials', 'manpower', 'intelligence', 'political_capital'] as ResourceType[]) {
    const base = BASE_GENERATION[type]
    const territoryBonus = territoryCount * 0.3
    const economicBonus = economicPower * 0.02

    // 军事维护
    const militaryUpkeep = type === 'treasury' ? militaryStrength * UPKEEP_COSTS.military_per_unit : 0
    // 人口消耗
    const populationCost = type === 'food' ? population * UPKEEP_COSTS.population_per_unit : 0
    // 领地消耗
    const territoryCost = type === 'materials' ? territoryCount * UPKEEP_COSTS.territory_per_unit : 0
    // 情报维护
    const intelUpkeep = type === 'intelligence' ? UPKEEP_COSTS.intelligence_base : 0

    const totalUpkeep = militaryUpkeep + populationCost + territoryCost + intelUpkeep
    const net = base + territoryBonus + economicBonus - totalUpkeep

    // 集权度影响政治资本生成
    const politicalBonus = type === 'political_capital' && personality
      ? (personality.centralization - 50) * 0.02
      : 0

    result[type] = {
      base_rate: base,
      territory_bonus: territoryBonus,
      economic_power_bonus: economicBonus + politicalBonus,
      military_upkeep: militaryUpkeep,
      population_cost: populationCost,
      intelligence_upkeep: intelUpkeep,
      net: net + politicalBonus,
    }
  }

  return result as Record<ResourceType, ResourceGeneration>
}

/**
 * 应用资源生成到资源池
 */
export function applyResourceGeneration(
  pool: OrgResourcePool,
  generation: Record<ResourceType, ResourceGeneration>,
): OrgResourcePool {
  const result = { ...pool }
  for (const [type, gen] of Object.entries(generation)) {
    const key = type as ResourceType
    result[key] = Math.max(RESOURCE_MIN, Math.min(RESOURCE_CAP, (result[key] ?? 0) + gen.net))
  }
  return result
}

// ─── 资源交易 ───

/**
 * 模拟两个组织间的资源交易
 */
export function simulateResourceTransaction(
  fromPool: OrgResourcePool,
  toPool: OrgResourcePool,
  fromStrategy: ResourceStrategy,
  resourceType: ResourceType,
  amount: number,
  currentTick: number,
): { transaction: ResourceTransaction; fromPool: OrgResourcePool; toPool: OrgResourcePool } {
  const successRate = STRATEGY_SUCCESS_RATES[fromStrategy]
  const success = Math.random() < successRate

  const newFromPool = { ...fromPool }
  const newToPool = { ...toPool }

  if (success) {
    const gainMultiplier = STRATEGY_RESOURCE_GAIN[fromStrategy]
    const actualAmount = Math.min(amount, fromPool[resourceType])

    if (fromStrategy === 'share' || fromStrategy === 'cooperate') {
      // 给予对方资源
      newFromPool[resourceType] = Math.max(RESOURCE_MIN, newFromPool[resourceType] - actualAmount)
      newToPool[resourceType] = Math.min(RESOURCE_CAP, newToPool[resourceType] + actualAmount * gainMultiplier)
    } else if (fromStrategy === 'steal') {
      // 从对方窃取
      const stolen = Math.min(amount * gainMultiplier, toPool[resourceType])
      newToPool[resourceType] = Math.max(RESOURCE_MIN, newToPool[resourceType] - stolen)
      newFromPool[resourceType] = Math.min(RESOURCE_CAP, newFromPool[resourceType] + stolen)
    } else if (fromStrategy === 'direct_compete') {
      // 竞争获取（双方都有损耗）
      newFromPool[resourceType] = Math.max(RESOURCE_MIN, newFromPool[resourceType] - actualAmount * 0.3)
      newToPool[resourceType] = Math.max(RESOURCE_MIN, newToPool[resourceType] - actualAmount * 0.2)
      newFromPool[resourceType] = Math.min(RESOURCE_CAP, newFromPool[resourceType] + actualAmount * gainMultiplier * 0.5)
    }
    // deceive 和 hoard 不直接转移
  } else {
    // 失败：竞争/偷窃有反噬
    if (fromStrategy === 'steal') {
      newFromPool[resourceType] = Math.max(RESOURCE_MIN, newFromPool[resourceType] - amount * 0.2)
    }
  }

  return {
    transaction: {
      from_org_id: '',
      to_org_id: '',
      resource_type: resourceType,
      amount,
      strategy: fromStrategy,
      success,
      tick: currentTick,
    },
    fromPool: newFromPool,
    toPool: newToPool,
  }
}

// ─── 稀缺度计算 ───

/**
 * 计算资源稀缺程度 [0, 1]
 */
export function calcResourceScarcity(pool: OrgResourcePool): number {
  const levels = [
    pool.treasury / 200,
    pool.food / 300,
    pool.materials / 200,
    pool.manpower / 100,
    pool.intelligence / 50,
    pool.political_capital / 50,
  ]
  const avgLevel = levels.reduce((s, l) => s + Math.min(1, l), 0) / levels.length
  return Math.max(0, 1 - avgLevel)
}

/**
 * 创建默认资源池
 */
export function createDefaultResourcePool(): OrgResourcePool {
  return {
    treasury: 100,
    food: 150,
    materials: 80,
    manpower: 50,
    intelligence: 20,
    political_capital: 30,
  }
}

/**
 * 格式化资源为 LLM 上下文
 */
export function formatResourcesForLLM(orgName: string, pool: OrgResourcePool): string {
  return `${orgName} 资源：金库${pool.treasury.toFixed(0)} 粮食${pool.food.toFixed(0)} 材料${pool.materials.toFixed(0)} 人力${pool.manpower.toFixed(0)} 情报${pool.intelligence.toFixed(0)} 政治资本${pool.political_capital.toFixed(0)}`
}
