import type { WorldSnapshot } from '@/core/world'
import type { GodCommand } from '@/core/sim/command'
import type { WorldFact } from '@/core/sim/fact'
import type { SimEvent } from '@/core/sim/event'

/**
 * Agent 阈值激活机制
 *
 * 每个组织和角色每 tick 计算一个"行动分"（activation score）。
 * 超过阈值 → 触发 LLM 决策
 * 低于阈值 → 走数学引擎（确定性规则）
 */

const ACTIVATION_THRESHOLD = 40

export type ActivationResult = {
  activated_orgs: string[]
  activated_chars: string[]
  org_scores: Record<string, number>
  char_scores: Record<string, number>
  reasons: Record<string, string[]>
}

/**
 * 计算组织激活分
 */
function calcOrgActivationScore(
  org: Record<string, any>,
  world: WorldSnapshot,
  recentEvents: SimEvent[],
  pendingCommands: GodCommand[],
  facts: WorldFact[],
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  const influence = org.influence_score ?? 50
  score += influence * 0.15
  if (influence > 60) reasons.push('势力强大')

  const resources = typeof org.resources === 'number' ? org.resources : 50
  if (resources < 30) {
    score += (30 - resources) * 0.5
    reasons.push('资源紧张')
  }

  const cohesion = org.cohesion ?? 50
  if (cohesion < 40) {
    score += (40 - cohesion) * 0.3
    reasons.push('内部矛盾')
  }

  const conflictEvents = recentEvents.filter(e =>
    (e.type === 'battle' || e.type === 'rebellion' || e.type === 'betrayal') &&
    (e.target_ids?.includes(org.id) || e.actor_ids?.includes(org.id))
  )
  if (conflictEvents.length > 0) {
    score += conflictEvents.length * 15
    reasons.push(`近期${conflictEvents.length}次冲突`)
  }

  const orgCommands = pendingCommands.filter(c =>
    c.target_id === org.id || c.target_type === 'world'
  )
  if (orgCommands.length > 0) {
    score += orgCommands.length * 25
    reasons.push(`${orgCommands.length}个待执行命令`)
  }

  const relevantFacts = facts.filter(f =>
    f.active && f.affected_entities.includes(org.id) &&
    f.discovered_at_tick > (world.tick ?? 0) - 10
  )
  if (relevantFacts.length > 0) {
    score += relevantFacts.length * 10
    reasons.push(`${relevantFacts.length}个新事实`)
  }

  if (org.status === 'declining') {
    score += 15
    reasons.push('处于衰退期')
  } else if (org.status === 'rising') {
    score += 10
    reasons.push('处于上升期')
  }

  score += (Math.random() - 0.5) * 8

  return { score: Math.max(0, score), reasons }
}

/**
 * 计算角色激活分 — 20 属性增强版
 */
function calcCharActivationScore(
  char: Record<string, any>,
  world: WorldSnapshot,
  recentEvents: SimEvent[],
  pendingCommands: GodCommand[],
  allChars: Record<string, any>[],
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // 基础分：影响力
  const influence = char.influence ?? 1
  score += Math.min(30, influence * 0.1)
  if (influence > 50) reasons.push('影响力大')

  // 士气分：极端值更活跃
  const morale = char.morale ?? 55
  if (morale < 30) {
    score += (30 - morale) * 0.3
    reasons.push('士气低落')
  } else if (morale > 80) {
    score += (morale - 80) * 0.2
    reasons.push('士气高涨')
  }

  // 健康分：健康恶化更活跃
  const health = char.health ?? 80
  if (health < 25) {
    score += (25 - health) * 0.4
    reasons.push('健康恶化')
  }
  if (health < 10) {
    score += 20
    reasons.push('生命垂危')
  }

  // 压力分：高压力更活跃（容易做出极端行为）
  const stress = char.stress ?? 20
  if (stress > 75) {
    score += (stress - 75) * 0.3
    reasons.push('压力过大')
  }

  // 理智分：低理智更活跃
  const sanity = char.sanity ?? 80
  if (sanity < 30) {
    score += (30 - sanity) * 0.4
    reasons.push('理智动摇')
  }

  // 忠诚分：低忠诚更活跃（可能叛变）
  const loyalty = char.loyalty ?? 50
  if (loyalty < 20) {
    score += (20 - loyalty) * 0.5
    reasons.push('忠诚动摇')
  }

  // 财富分：赤字更活跃
  const wealth = char.wealth ?? 1
  if (wealth < 5) {
    score += 15
    reasons.push('濒临破产')
  }

  // 关系冲突分：有敌对角色在同一区域
  const charLocation = char.location_region_id
  if (charLocation) {
    const localEnemies = allChars.filter(c =>
      c.location_region_id === charLocation &&
      c.id !== char.id &&
      (char.relations ?? []).some((r: any) => r.character_id === c.id && r.type === 'enemy')
    )
    if (localEnemies.length > 0) {
      score += localEnemies.length * 12
      reasons.push(`${localEnemies.length}个敌对角色在附近`)
    }
  }

  // condition 标签分
  const condition = char.condition
  if (condition === 'scheming') { score += 20; reasons.push('处于密谋状态') }
  if (condition === 'unhinged') { score += 25; reasons.push('失控') }
  if (condition === 'breaking') { score += 15; reasons.push('崩溃边缘') }
  if (condition === 'desperate') { score += 10; reasons.push('绝望') }

  // 任务分
  if (char.current_task) {
    score += 10
    reasons.push('有进行中任务')
  }

  // 命令分
  const charCommands = pendingCommands.filter(c =>
    c.target_id === char.id || (c.target_type === 'world' && c.raw_input.includes(char.name))
  )
  if (charCommands.length > 0) {
    score += charCommands.length * 30
    reasons.push(`${charCommands.length}个待执行命令`)
  }

  // 事件分
  const charEvents = recentEvents.filter(e =>
    e.actor_ids?.includes(char.id) || e.target_ids?.includes(char.id)
  )
  if (charEvents.length > 0) {
    score += charEvents.length * 8
    reasons.push(`近期${charEvents.length}次事件`)
  }

  score += (Math.random() - 0.5) * 6

  return { score: Math.max(0, score), reasons }
}

/**
 * 计算所有实体的激活分，返回需要 LLM 决策的实体
 */
export function calculateActivation(
  world: WorldSnapshot,
  recentEvents: SimEvent[],
  pendingCommands: GodCommand[],
  facts: WorldFact[],
): ActivationResult {
  const w = world as any
  const orgs: Record<string, any>[] = Array.isArray(w.organizations) ? w.organizations
    : Array.isArray(w.factions) ? w.factions
    : []
  const chars: Record<string, any>[] = Array.isArray(w.characters) ? w.characters : []

  const orgScores: Record<string, number> = {}
  const charScores: Record<string, number> = {}
  const reasons: Record<string, string[]> = {}
  const activatedOrgs: string[] = []
  const activatedChars: string[] = []

  for (const org of orgs) {
    const result = calcOrgActivationScore(org, world, recentEvents, pendingCommands, facts)
    orgScores[org.id] = result.score
    reasons[org.id] = result.reasons
    if (result.score >= ACTIVATION_THRESHOLD) {
      activatedOrgs.push(org.id)
    }
  }

  for (const char of chars) {
    const result = calcCharActivationScore(char, world, recentEvents, pendingCommands, chars)
    charScores[char.id] = result.score
    reasons[char.id] = result.reasons
    if (result.score >= ACTIVATION_THRESHOLD) {
      activatedChars.push(char.id)
    }
  }

  return {
    activated_orgs: activatedOrgs,
    activated_chars: activatedChars,
    org_scores: orgScores,
    char_scores: charScores,
    reasons,
  }
}

/**
 * 获取激活实体的上下文摘要（用于 LLM prompt）
 */
export function getActivationContext(
  activation: ActivationResult,
  orgs: Array<{ id: string; name: string; [key: string]: any }>,
  chars: Array<{ id: string; name: string; [key: string]: any }>,
): string {
  const lines: string[] = []

  if (activation.activated_orgs.length > 0) {
    lines.push('## 需要重大决策的组织')
    for (const orgId of activation.activated_orgs) {
      const org = orgs.find(o => o.id === orgId)
      if (!org) continue
      const score = activation.org_scores[orgId] ?? 0
      const reasons = activation.reasons[orgId] ?? []
      lines.push(`- ${org.name}（激活分：${score.toFixed(0)}，原因：${reasons.join('、')}）`)
    }
  }

  if (activation.activated_chars.length > 0) {
    lines.push('## 需要重大决策的角色')
    for (const charId of activation.activated_chars) {
      const char = chars.find(c => c.id === charId)
      if (!char) continue
      const score = activation.char_scores[charId] ?? 0
      const reasons = activation.reasons[charId] ?? []
      lines.push(`- ${char.name}（激活分：${score.toFixed(0)}，原因：${reasons.join('、')}）`)
    }
  }

  return lines.join('\n')
}
