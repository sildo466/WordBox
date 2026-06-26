/**
 * 组织多维声誉系统
 *
 * 五维声誉：军事威望、经济信誉、外交信任、文化影响力、内部稳定
 * 声誉通过社交网络传播，有视角偏差和置信度
 */

// ─── 类型定义 ───

export type OrgReputation = {
  military_prowess: number     // [0, 100] 军事威望
  economic_reliability: number // [0, 100] 经济信誉
  diplomatic_trust: number     // [0, 100] 外交信任度
  cultural_prestige: number    // [0, 100] 文化影响力
  internal_stability: number   // [0, 100] 内部稳定声誉
}

/** 声誉事件类型 → 各维度影响 */
type ReputationImpact = Partial<Record<keyof OrgReputation, number>>

/** 声誉查询结果（带视角偏差和置信度） */
export type ReputationView = {
  dimensions: OrgReputation
  confidence: number  // [0, 1] — 信息置信度
  bias: 'positive' | 'negative' | 'neutral'
}

/** 声誉传播记录 */
type ReputationPropagation = {
  source_org_id: string
  target_org_id: string
  dimension: keyof OrgReputation
  value: number
  tick: number
  confidence: number
}

// ─── 常量 ───

const DEFAULT_REPUTATION: OrgReputation = {
  military_prowess: 50,
  economic_reliability: 50,
  diplomatic_trust: 50,
  cultural_prestige: 50,
  internal_stability: 50,
}

const REPUTATION_DECAY_RATE = 0.003       // 每 tick 向均值回归的速率
const REPUTATION_MEAN = 50
const PROPAGATION_DECAY = 0.3             // 传播时的衰减
const DIRECT_WITNESS_CONFIDENCE = 0.9     // 直接观察的置信度
const SECOND_HAND_CONFIDENCE = 0.5        // 间接传闻的置信度
const MAX_PROPAGATION_DISTANCE = 3        // 最大传播跳数

// ─── 事件 → 声誉影响映射 ───

const REPUTATION_EVENT_MAP: Record<string, ReputationImpact> = {
  battle: { military_prowess: 5, diplomatic_trust: -3 },
  victory: { military_prowess: 10, internal_stability: 5, cultural_prestige: 3 },
  defeat: { military_prowess: -8, internal_stability: -5, diplomatic_trust: -3 },
  trade: { economic_reliability: 6, diplomatic_trust: 3 },
  economic_growth: { economic_reliability: 4 },
  economic_decline: { economic_reliability: -5, internal_stability: -3 },
  alliance: { diplomatic_trust: 8, cultural_prestige: 3 },
  betrayal: { diplomatic_trust: -15, internal_stability: -5 },
  negotiation: { diplomatic_trust: 5 },
  rebellion: { internal_stability: -12, military_prowess: -3 },
  discovery: { cultural_prestige: 8 },
  ritual: { cultural_prestige: 5, internal_stability: 3 },
  cultural_exchange: { cultural_prestige: 6, diplomatic_trust: 3 },
  migration: { economic_reliability: -2, cultural_prestige: 2 },
  disaster: { internal_stability: -5, economic_reliability: -3 },
  assassination: { internal_stability: -10, diplomatic_trust: -5 },
  technology: { cultural_prestige: 5, economic_reliability: 3, military_prowess: 2 },
  god_command: { internal_stability: 3 },
}

// ─── 核心函数 ───

export function createOrgReputation(partial?: Partial<OrgReputation>): OrgReputation {
  return { ...DEFAULT_REPUTATION, ...partial }
}

/**
 * 根据事件更新组织声誉
 */
export function applyReputationEvent(
  reputation: OrgReputation,
  eventType: string,
  importance: number,
): OrgReputation {
  const impact = REPUTATION_EVENT_MAP[eventType]
  if (!impact) return reputation

  const result = { ...reputation }
  for (const [key, delta] of Object.entries(impact)) {
    if (delta == null) continue
    const k = key as keyof OrgReputation
    // 影响量 = 基础值 × 重要性系数
    const scaledDelta = delta * (0.5 + importance * 0.5)
    result[k] = Math.max(0, Math.min(100, (result[k] ?? 50) + scaledDelta))
  }

  return result
}

/**
 * 声誉自然衰减 — 每 tick 向均值回归
 */
export function decayReputation(reputation: OrgReputation): OrgReputation {
  const result: OrgReputation = {} as OrgReputation
  for (const key of Object.keys(reputation) as Array<keyof OrgReputation>) {
    const current = reputation[key]
    const delta = (REPUTATION_MEAN - current) * REPUTATION_DECAY_RATE
    result[key] = Math.max(0, Math.min(100, current + delta))
  }
  return result
}

/**
 * 声誉传播 — 通过社交网络传播
 *
 * 传播路径：观察者组织 → 观察者的盟友/贸易伙伴 → 盟友的盟友...
 * 每跳衰减 30%，最多 3 跳
 */
export function propagateReputation(
  allOrgs: Array<{ id: string; relations: Array<{ organization_id: string; type: string }> }>,
  reputationMap: Map<string, OrgReputation>,
  eventOrgId: string,
  eventType: string,
  importance: number,
  currentTick: number,
): ReputationPropagation[] {
  const propagations: ReputationPropagation[] = []
  const visited = new Set<string>()
  const queue: Array<{ orgId: string; depth: number; confidence: number }> = []

  // 从事件主体开始
  queue.push({ orgId: eventOrgId, depth: 0, confidence: DIRECT_WITNESS_CONFIDENCE })
  visited.add(eventOrgId)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.depth >= MAX_PROPAGATION_DISTANCE) continue

    // 找到该组织的盟友和贸易伙伴
    const org = allOrgs.find(o => o.id === current.orgId)
    if (!org) continue

    for (const rel of org.relations) {
      if (visited.has(rel.organization_id)) continue
      if (rel.type !== 'ally' && rel.type !== 'trading_partner') continue

      visited.add(rel.organization_id)

      // 传播衰减
      const propagatedConfidence = current.confidence * (1 - PROPAGATION_DECAY)
      if (propagatedConfidence < 0.1) continue

      // 记录传播
      const impact = REPUTATION_EVENT_MAP[eventType]
      if (impact) {
        for (const [dim, delta] of Object.entries(impact)) {
          if (delta == null) continue
          propagations.push({
            source_org_id: current.orgId,
            target_org_id: rel.organization_id,
            dimension: dim as keyof OrgReputation,
            value: delta * importance * propagatedConfidence,
            tick: currentTick,
            confidence: propagatedConfidence,
          })
        }
      }

      queue.push({
        orgId: rel.organization_id,
        depth: current.depth + 1,
        confidence: propagatedConfidence,
      })
    }
  }

  return propagations
}

/**
 * 视角偏差查询 — 查询者看到的是经过关系滤镜的声誉
 *
 * - 盟友：正面偏差 (+5~+15)
 * - 敌人：负面偏差 (-5~-15)
 * - 中性：无偏差
 * - 置信度：基于关系强度和事件数量
 */
export function queryReputationWithBias(
  targetReputation: OrgReputation,
  relationType: string,
  relationStrength: number,
  eventCount: number,
): ReputationView {
  // 偏差方向和强度
  let biasDirection: ReputationView['bias'] = 'neutral'
  let biasMagnitude = 0

  if (relationType === 'ally' || relationType === 'trading_partner') {
    biasDirection = 'positive'
    biasMagnitude = 5 + Math.abs(relationStrength) * 10
  } else if (relationType === 'enemy') {
    biasDirection = 'negative'
    biasMagnitude = 5 + Math.abs(relationStrength) * 10
  }

  // 应用偏差
  const biasedDimensions: OrgReputation = {} as OrgReputation
  for (const key of Object.keys(targetReputation) as Array<keyof OrgReputation>) {
    const base = targetReputation[key]
    const bias = biasDirection === 'positive' ? biasMagnitude : biasDirection === 'negative' ? -biasMagnitude : 0
    biasedDimensions[key] = Math.max(0, Math.min(100, base + bias))
  }

  // 置信度计算
  const eventConfidence = Math.min(1, eventCount * 0.15)
  const relationConfidence = Math.abs(relationStrength) * 0.5
  const confidence = Math.min(1, eventConfidence + relationConfidence)

  return {
    dimensions: biasedDimensions,
    confidence,
    bias: biasDirection,
  }
}

/**
 * 综合声誉分 — 加权平均五个维度
 */
export function calcOverallReputation(reputation: OrgReputation): number {
  return (
    reputation.military_prowess * 0.25 +
    reputation.economic_reliability * 0.2 +
    reputation.diplomatic_trust * 0.25 +
    reputation.cultural_prestige * 0.15 +
    reputation.internal_stability * 0.15
  )
}

/**
 * 格式化声誉为 LLM 上下文
 */
export function formatReputationForLLM(
  orgName: string,
  reputation: OrgReputation,
): string {
  const overall = calcOverallReputation(reputation)
  const parts = [
    `军事威望:${reputation.military_prowess.toFixed(0)}`,
    `经济信誉:${reputation.economic_reliability.toFixed(0)}`,
    `外交信任:${reputation.diplomatic_trust.toFixed(0)}`,
    `文化影响:${reputation.cultural_prestige.toFixed(0)}`,
    `内部稳定:${reputation.internal_stability.toFixed(0)}`,
  ]
  return `${orgName} 声誉（综合:${overall.toFixed(0)}）：${parts.join('、')}`
}
