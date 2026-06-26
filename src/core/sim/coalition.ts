/**
 * 联盟/集团系统
 *
 * 当某组织权力过高时，弱组织自动形成反霸权联盟
 * 联盟有内部凝聚力，会随时间衰减
 */

import type { OrgPersonality } from './org-personality'

// ─── 类型定义 ───

export type CoalitionPurpose = 'counter_hegemony' | 'economic_bloc' | 'ideological_union' | 'conquest_pact' | 'defense_pact'

export type Coalition = {
  id: string
  name: string
  members: string[]              // 组织 ID
  purpose: CoalitionPurpose
  target_org_id: string | null   // 反对谁（如果是反霸权）
  cohesion: number               // [0, 100] 联盟内部凝聚力
  formed_tick: number
  expiry_tick: number | null
  status: 'forming' | 'active' | 'fractured' | 'dissolved'
  leader_org_id: string | null   // 联盟主导者
  shared_resources: number       // 共享资源池
  history: string[]              // 联盟大事记
}

// ─── 常量 ───

const COALITION_COHESION_DECAY = 0.3    // 每 tick 凝聚力衰减
const COALITION_FORMATION_THRESHOLD = 0.6 // 触发联盟形成的权力失衡阈值
const MIN_COALITION_SIZE = 2
const MAX_COALITION_SIZE = 5
const COALITION_BASE_DURATION = 80

// ─── 联盟形成 ───

/**
 * 检查是否应该形成新联盟
 *
 * 触发条件：
 * 1. 某组织权力占比超过阈值
 * 2. 弱组织间有相似的利益/威胁感知
 * 3. 弱组织的性格允许结盟（openness > 30, aggression < 80）
 */
export function checkCoalitionFormation(
  orgs: Array<{
    id: string
    name: string
    personality?: OrgPersonality
    relations: Array<{ organization_id: string; type: string; strength: number }>
  }>,
  powerRatings: Record<string, number>,
  existingCoalitions: Coalition[],
  currentTick: number,
): Coalition[] {
  const newCoalitions: Coalition[] = []

  // 计算权力分布
  const totalPower = Object.values(powerRatings).reduce((s, p) => s + p, 0)
  if (totalPower === 0) return newCoalitions

  const sortedOrgs = [...orgs].sort((a, b) => (powerRatings[b.id] ?? 0) - (powerRatings[a.id] ?? 0))
  const topOrg = sortedOrgs[0]
  const topPowerRatio = (powerRatings[topOrg.id] ?? 0) / totalPower

  // 权力未失衡，不形成联盟
  if (topPowerRatio < COALITION_FORMATION_THRESHOLD) return newCoalitions

  // 检查是否已有针对该组织的联盟
  const existingTargetCoalition = existingCoalitions.find(
    c => c.target_org_id === topOrg.id && c.status === 'active',
  )
  if (existingTargetCoalition) return newCoalitions

  // 寻找愿意结盟的弱组织
  const potentialMembers = sortedOrgs.slice(1).filter(org => {
    // 已在其他联盟中
    const inCoalition = existingCoalitions.some(c => c.members.includes(org.id) && c.status === 'active')
    if (inCoalition) return false

    // 性格检查：开放性够高，好战性不太极端
    const p = org.personality
    if (p) {
      if (p.openness < 25) return false
      if (p.aggression > 85) return false
    }

    // 关系检查：与霸权者关系不好
    const relToTop = (org.relations ?? []).find(r => r.organization_id === topOrg.id)
    if (relToTop?.type === 'ally') return false

    return true
  })

  if (potentialMembers.length < MIN_COALITION_SIZE - 1) return newCoalitions

  // 取最强的几个弱组织组成联盟
  const members = potentialMembers.slice(0, MAX_COALITION_SIZE - 1)
  const leader = members.reduce((best, org) =>
    (powerRatings[org.id] ?? 0) > (powerRatings[best.id] ?? 0) ? org : best,
  )

  // 计算联盟凝聚力（基于成员间关系和性格相似度）
  const cohesion = calcInitialCoalitionCohesion(members)

  const purpose = selectCoalitionPurpose(members, topOrg)

  newCoalitions.push({
    id: `coalition_${currentTick}_${Math.random().toString(36).slice(2, 6)}`,
    name: generateCoalitionName(purpose, topOrg.name),
    members: members.map(m => m.id),
    purpose,
    target_org_id: topOrg.id,
    cohesion,
    formed_tick: currentTick,
    expiry_tick: currentTick + COALITION_BASE_DURATION,
    status: 'forming',
    leader_org_id: leader.id,
    shared_resources: 0,
    history: [`在 tick ${currentTick} 成立，目标：对抗 ${topOrg.name}`],
  })

  return newCoalitions
}

// ─── 联盟演算 ───

/**
 * 每 tick 更新联盟状态
 */
export function evolveCoalitions(
  coalitions: Coalition[],
  orgs: Array<{
    id: string
    personality?: OrgPersonality
    relations: Array<{ organization_id: string; type: string; strength: number }>
  }>,
  powerRatings: Record<string, number>,
  currentTick: number,
): void {
  for (const coalition of coalitions) {
    if (coalition.status !== 'active' && coalition.status !== 'forming') continue

    // 凝聚力衰减
    coalition.cohesion = Math.max(0, coalition.cohesion - COALITION_COHESION_DECAY)

    // 成员间关系影响凝聚力
    const memberOrgs = orgs.filter(o => coalition.members.includes(o.id))
    for (const org of memberOrgs) {
      for (const other of memberOrgs) {
        if (org.id === other.id) continue
        const rel = (org.relations ?? []).find(r => r.organization_id === other.id)
        if (rel?.type === 'ally') coalition.cohesion = Math.min(100, coalition.cohesion + 0.2)
        if (rel?.type === 'enemy') coalition.cohesion = Math.max(0, coalition.cohesion - 0.5)
      }
    }

    // 目标消失（被灭/投降）→ 联盟失去目的
    if (coalition.target_org_id) {
      const targetPower = powerRatings[coalition.target_org_id] ?? 0
      const coalitionPower = coalition.members.reduce((s, id) => s + (powerRatings[id] ?? 0), 0)
      if (targetPower < coalitionPower * 0.2) {
        coalition.cohesion -= 2 // 目标弱化，联盟失去凝聚力
      }
    }

    // 凝聚力过低 → 解散
    if (coalition.cohesion < 10) {
      coalition.status = 'dissolved'
      coalition.history.push(`在 tick ${currentTick} 因凝聚力崩溃而解散`)
      continue
    }

    // 过期
    if (coalition.expiry_tick != null && currentTick >= coalition.expiry_tick) {
      coalition.status = 'expired' as any
      coalition.history.push(`在 tick ${currentTick} 到期解散`)
      continue
    }

    // forming → active（需要 3 tick 的稳定期）
    if (coalition.status === 'forming' && currentTick - coalition.formed_tick >= 3) {
      if (coalition.cohesion > 30) {
        coalition.status = 'active'
        coalition.history.push(`在 tick ${currentTick} 正式激活`)
      } else {
        coalition.status = 'dissolved'
        coalition.history.push(`在 tick ${currentTick} 组建失败`)
      }
    }
  }
}

// ─── 联盟决策 ───

/**
 * 联盟集体决策 — 基于成员性格投票
 */
export function coalitionDecision(
  coalition: Coalition,
  orgs: Array<{ id: string; personality?: OrgPersonality }>,
  question: 'declare_war' | 'offer_peace' | 'trade_pact' | 'invite_member' | 'expel_member',
): { decision: boolean; support_ratio: number; dissenters: string[] } {
  const memberOrgs = orgs.filter(o => coalition.members.includes(o.id))

  let supportCount = 0
  const dissenters: string[] = []

  for (const org of memberOrgs) {
    const p = org.personality
    if (!p) { supportCount++; continue }

    let supports = false
    switch (question) {
      case 'declare_war':
        supports = p.aggression > 60 && p.pragmatism > 40
        break
      case 'offer_peace':
        supports = p.openness > 50 || p.pragmatism > 60
        break
      case 'trade_pact':
        supports = p.pragmatism > 45 && p.openness > 40
        break
      case 'invite_member':
        supports = p.openness > 55
        break
      case 'expel_member':
        supports = p.tradition > 60 || p.centralization > 60
        break
    }

    if (supports) supportCount++
    else dissenters.push(org.id)
  }

  const supportRatio = supportCount / Math.max(1, memberOrgs.length)
  return {
    decision: supportRatio > 0.5,
    support_ratio: supportRatio,
    dissenters,
  }
}

// ─── 辅助函数 ───

function calcInitialCoalitionCohesion(
  members: Array<{ id: string; personality?: OrgPersonality; relations: Array<{ organization_id: string; type: string }> }>,
): number {
  let cohesion = 50 // 基础凝聚力

  // 成员间关系加分
  for (const org of members) {
    for (const other of members) {
      if (org.id === other.id) continue
      const rel = (org.relations ?? []).find(r => r.organization_id === other.id)
      if (rel?.type === 'ally') cohesion += 5
      if (rel?.type === 'enemy') cohesion -= 10
    }
  }

  // 性格相似度加分
  if (members.length >= 2) {
    const avgOpenness = members.reduce((s, m) => s + (m.personality?.openness ?? 50), 0) / members.length
    const avgAggression = members.reduce((s, m) => s + (m.personality?.aggression ?? 50), 0) / members.length
    const opennessVariance = members.reduce((s, m) => s + Math.pow((m.personality?.openness ?? 50) - avgOpenness, 2), 0) / members.length
    const aggressionVariance = members.reduce((s, m) => s + Math.pow((m.personality?.aggression ?? 50) - avgAggression, 2), 0) / members.length
    // 方差越小，凝聚力越高
    cohesion -= (opennessVariance + aggressionVariance) * 0.02
  }

  return Math.max(20, Math.min(80, cohesion))
}

function selectCoalitionPurpose(
  members: Array<{ personality?: OrgPersonality }>,
  target: { name: string },
): CoalitionPurpose {
  const avgAggression = members.reduce((s, m) => s + (m.personality?.aggression ?? 50), 0) / members.length
  const avgPragmatism = members.reduce((s, m) => s + (m.personality?.pragmatism ?? 50), 0) / members.length

  if (avgAggression > 60) return 'conquest_pact'
  if (avgPragmatism > 60) return 'economic_bloc'
  return 'counter_hegemony'
}

function generateCoalitionName(purpose: CoalitionPurpose, targetName: string): string {
  const prefixes: Record<CoalitionPurpose, string> = {
    counter_hegemony: '反霸权同盟',
    economic_bloc: '经济联合体',
    ideological_union: '意识形态联盟',
    conquest_pact: '征伐协约',
    defense_pact: '防御同盟',
  }
  return `${prefixes[purpose]}（针对${targetName}）`
}

/**
 * 格式化联盟信息为 LLM 上下文
 */
export function formatCoalitionsForLLM(
  coalitions: Coalition[],
  allOrgs: Array<{ id: string; name: string }>,
): string {
  const active = coalitions.filter(c => c.status === 'active' || c.status === 'forming')
  if (active.length === 0) return '当前世界没有活跃联盟'

  const lines = active.map(c => {
    const memberNames = c.members.map(id => allOrgs.find(o => o.id === id)?.name ?? id).join('、')
    const targetName = c.target_org_id ? allOrgs.find(o => o.id === c.target_org_id)?.name ?? '未知' : '无'
    return `- ${c.name}：成员[${memberNames}]，目标:${targetName}，凝聚力:${c.cohesion.toFixed(0)}`
  })

  return `活跃联盟：\n${lines.join('\n')}`
}
