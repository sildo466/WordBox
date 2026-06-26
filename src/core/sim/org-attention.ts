/**
 * 组织注意力分配系统
 *
 * 组织不能同时关注所有事情
 * 注意力容量 = base + centralization_bonus
 * 分配由显著性、紧迫度、相关性决定
 */

import type { OrgPersonality } from './org-personality'

// ─── 类型定义 ───

export type AttentionTarget = {
  id: string
  type: 'organization' | 'region' | 'event' | 'threat' | 'opportunity'
  name: string
  salience: number     // [0, 1] — 显著性
  urgency: number      // [0, 1] — 紧迫度
  relevance: number    // [0, 1] — 与组织目标的相关性
  total_weight: number // 综合权重
}

export type AttentionAllocation = {
  org_id: string
  capacity: number         // 最大关注目标数
  focused_targets: AttentionTarget[]  // 当前关注的目标
  ignored_targets: AttentionTarget[]  // 被忽略的目标
  fatigue: number          // [0, 1] — 注意力疲劳
}

// ─── 常量 ───

const BASE_ATTENTION_CAPACITY = 3
const CENTRALIZATION_CAPACITY_FACTOR = 0.03  // 每点集权度增加的容量
const FATIGUE_PER_TICK = 0.05
const FATIGUE_RECOVERY_RATE = 0.1
const SALIENCE_WEIGHT = 0.4
const URGENCY_WEIGHT = 0.35
const RELEVANCE_WEIGHT = 0.25

// ─── 注意力分配 ───

/**
 * 计算组织的注意力容量
 */
export function calcAttentionCapacity(personality: OrgPersonality): number {
  // 高集权 → 聚焦但狭窄
  // 低集权 → 分散但广泛
  const capacity = BASE_ATTENTION_CAPACITY + Math.floor(personality.centralization * CENTRALIZATION_CAPACITY_FACTOR)
  return Math.max(2, Math.min(8, capacity))
}

/**
 * 分配组织注意力
 */
export function allocateAttention(
  orgId: string,
  personality: OrgPersonality,
  targets: AttentionTarget[],
  currentFatigue: number,
): AttentionAllocation {
  const capacity = calcAttentionCapacity(personality)

  // 计算综合权重
  const weightedTargets = targets.map(target => {
    // 疲劳降低感知显著性
    const fatiguePenalty = currentFatigue * 0.3
    const adjustedSalience = target.salience * (1 - fatiguePenalty)

    // 性格调节
    const personalityFactor = calcPersonalityAttentionFactor(personality, target.type)

    const totalWeight = (
      adjustedSalience * SALIENCE_WEIGHT +
      target.urgency * URGENCY_WEIGHT +
      target.relevance * RELEVANCE_WEIGHT
    ) * personalityFactor

    return { ...target, total_weight: Math.max(0, Math.min(1, totalWeight)) }
  })

  // 按权重排序
  weightedTargets.sort((a, b) => b.total_weight - a.total_weight)

  // 分配：前 capacity 个获得关注，其余被忽略
  const focused = weightedTargets.slice(0, capacity)
  const ignored = weightedTargets.slice(capacity)

  return {
    org_id: orgId,
    capacity,
    focused_targets: focused,
    ignored_targets: ignored,
    fatigue: currentFatigue,
  }
}

/**
 * 更新注意力疲劳
 */
export function updateAttentionFatigue(
  currentFatigue: number,
  isUnderPressure: boolean,
): number {
  if (isUnderPressure) {
    // 压力下疲劳增长更快
    return Math.min(1, currentFatigue + FATIGUE_PER_TICK * 2)
  }
  // 自然恢复
  return Math.max(0, currentFatigue - FATIGUE_RECOVERY_RATE)
}

// ─── 辅助函数 ───

function calcPersonalityAttentionFactor(
  personality: OrgPersonality,
  targetType: AttentionTarget['type'],
): number {
  const { aggression, openness, pragmatism, tradition } = personality

  switch (targetType) {
    case 'threat':
      // 好战组织更关注威胁
      return 0.7 + (aggression / 100) * 0.6
    case 'opportunity':
      // 开放组织更关注机会
      return 0.7 + (openness / 100) * 0.6
    case 'organization':
      // 务实组织更关注其他组织
      return 0.7 + (pragmatism / 100) * 0.5
    case 'region':
      // 传统组织更关注领地
      return 0.7 + (tradition / 100) * 0.5
    case 'event':
      // 开放组织更关注事件
      return 0.7 + (openness / 100) * 0.4
    default:
      return 1.0
  }
}

/**
 * 从世界状态构建注意力目标
 */
export function buildAttentionTargets(
  orgId: string,
  orgs: Array<{
    id: string
    name: string
    relations: Array<{ organization_id: string; type: string; strength: number }>
    status: string
    influence_score: number
  }>,
  regions: Array<{ id: string; name: string; danger_level: number; controlling_organization_id: string | null }>,
  recentEvents: Array<{ id: string; title: string; importance: number; actor_ids: string[]; target_ids: string[] }>,
  tensions: Array<{ id: string; type: string; intensity: number; source_org_id: string; target_org_id: string }>,
): AttentionTarget[] {
  const targets: AttentionTarget[] = []
  const self = orgs.find(o => o.id === orgId)
  if (!self) return targets

  // 其他组织作为目标
  for (const other of orgs) {
    if (other.id === orgId) continue
    const rel = (self.relations ?? []).find(r => r.organization_id === other.id)

    let salience = 0.3
    let urgency = 0.2
    let relevance = 0.3

    if (rel?.type === 'enemy') {
      salience = 0.7
      urgency = 0.6
      relevance = 0.8
    } else if (rel?.type === 'ally') {
      salience = 0.4
      urgency = 0.2
      relevance = 0.5
    }

    if (other.status === 'declining') {
      urgency = Math.max(urgency, 0.5)
      relevance = Math.max(relevance, 0.6)
    }

    targets.push({
      id: other.id,
      type: 'organization',
      name: other.name,
      salience, urgency, relevance,
      total_weight: 0,
    })
  }

  // 地区作为目标
  for (const region of regions) {
    let salience = 0.2
    let urgency = 0.1
    let relevance = 0.2

    // 自己控制的地区
    if (region.controlling_organization_id === orgId) {
      salience = 0.4
      relevance = 0.6
    }

    // 高危地区
    if (region.danger_level > 20) {
      salience = Math.max(salience, 0.5)
      urgency = Math.max(urgency, 0.4)
    }

    targets.push({
      id: region.id,
      type: 'region',
      name: region.name,
      salience, urgency, relevance,
      total_weight: 0,
    })
  }

  // 紧张度作为威胁/机会目标
  for (const tension of tensions) {
    if (tension.source_org_id !== orgId && tension.target_org_id !== orgId) continue

    targets.push({
      id: tension.id,
      type: 'threat',
      name: `${tension.type}紧张`,
      salience: tension.intensity / 100,
      urgency: tension.intensity / 100 * 0.8,
      relevance: 0.7,
      total_weight: 0,
    })
  }

  // 近期事件
  for (const event of recentEvents.slice(-5)) {
    const actorIds = event.actor_ids ?? []
    const targetIds = event.target_ids ?? []
    const involvesSelf = actorIds.includes(orgId) || targetIds.includes(orgId)
    if (!involvesSelf) continue

    targets.push({
      id: event.id,
      type: 'event',
      name: event.title,
      salience: event.importance,
      urgency: event.importance * 0.6,
      relevance: involvesSelf ? 0.8 : 0.3,
      total_weight: 0,
    })
  }

  return targets
}

/**
 * 格式化注意力分配为 LLM 上下文
 */
export function formatAttentionForLLM(allocation: AttentionAllocation): string {
  if (allocation.focused_targets.length === 0) return '当前没有需要关注的事项'

  const lines = allocation.focused_targets.map((target, i) => {
    const typeNames: Record<string, string> = {
      organization: '组织',
      region: '地区',
      event: '事件',
      threat: '威胁',
      opportunity: '机会',
    }
    return `${i + 1}. [${typeNames[target.type] ?? target.type}] ${target.name}（显著:${(target.salience * 100).toFixed(0)}% 紧迫:${(target.urgency * 100).toFixed(0)}%）`
  })

  const fatigueWarning = allocation.fatigue > 0.6
    ? `\n⚠ 注意力疲劳过高（${(allocation.fatigue * 100).toFixed(0)}%），决策质量可能下降`
    : ''

  return `当前关注事项（容量 ${allocation.capacity}）：\n${lines.join('\n')}${fatigueWarning}`
}
