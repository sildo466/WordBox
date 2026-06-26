/**
 * 组织战略分析系统
 *
 * 每个 tick 为每个组织生成局势分析，注入 LLM 上下文
 * 帮助 LLM 做出更合理的策略决策
 */

import type { OrgPersonality } from './org-personality'
import type { OrgReputation } from './org-reputation'

// ─── 类型定义 ───

export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'negligible'

export type Threat = {
  source_org_id: string
  level: ThreatLevel
  type: 'military' | 'economic' | 'ideological' | 'territorial' | 'diplomatic'
  description: string
  estimated_power: number
}

export type PowerBalance = {
  self_power: number
  strongest_rival_power: number
  power_ratio: number  // self / strongest_rival
  position: 'dominant' | 'strong' | 'balanced' | 'weak' | 'vulnerable'
}

export type Opportunity = {
  type: 'expansion' | 'alliance' | 'trade' | 'subjugation' | 'cultural'
  target_org_id: string | null
  description: string
  urgency: number  // [0, 1]
}

export type FaultLine = {
  type: 'internal_conflict' | 'resource_scarcity' | 'loyalty_crisis' | 'territorial_overstretch'
  description: string
  severity: number // [0, 1]
}

export type StrategicAnalysis = {
  org_id: string
  tick: number
  threats: Threat[]
  power_balance: PowerBalance
  opportunities: Opportunity[]
  fault_lines: FaultLine[]
  recommended_posture: 'aggressive' | 'defensive' | 'diplomatic' | 'expansionist' | 'consolidating'
  summary: string
}

// ─── 常量 ───

const THREAT_POWER_RATIO_CRITICAL = 2.0
const THREAT_POWER_RATIO_HIGH = 1.5
const THREAT_POWER_RATIO_MEDIUM = 1.0

// ─── 分析生成 ───

/**
 * 为组织生成战略分析
 */
export function generateStrategicAnalysis(
  orgId: string,
  orgs: Array<{
    id: string
    name: string
    personality?: OrgPersonality
    reputation?: OrgReputation
    relations: Array<{ organization_id: string; type: string; strength: number }>
    influence_score: number
    military_strength: number
    economic_power: number
    cohesion: number
    resources?: number
    territory?: string[]
    status: string
  }>,
  powerRatings: Record<string, number>,
  currentTick: number,
): StrategicAnalysis {
  const self = orgs.find(o => o.id === orgId)
  if (!self) {
    return createEmptyAnalysis(orgId, currentTick)
  }

  const selfPower = powerRatings[orgId] ?? 0
  const selfPersonality = self.personality

  // ── 威胁评估 ──
  const threats = assessThreats(self, orgs, powerRatings)

  // ── 权力平衡 ──
  const powerBalance = assessPowerBalance(self, orgs, powerRatings)

  // ── 机会窗口 ──
  const opportunities = assessOpportunities(self, orgs, powerRatings, selfPersonality)

  // ── 内部裂痕 ──
  const faultLines = assessFaultLines(self)

  // ── 建议姿态 ──
  const recommendedPosture = recommendPosture(selfPersonality, threats, powerBalance, faultLines)

  // ── 摘要 ──
  const summary = generateAnalysisSummary(self, threats, powerBalance, opportunities, faultLines, recommendedPosture)

  return {
    org_id: orgId,
    tick: currentTick,
    threats,
    power_balance: powerBalance,
    opportunities,
    fault_lines: faultLines,
    recommended_posture: recommendedPosture,
    summary,
  }
}

// ─── 威胁评估 ───

function assessThreats(
  self: { id: string; relations: Array<{ organization_id: string; type: string; strength: number }> },
  orgs: Array<{ id: string; name: string; military_strength: number; influence_score: number }>,
  powerRatings: Record<string, number>,
): Threat[] {
  const threats: Threat[] = []
  const selfPower = powerRatings[self.id] ?? 0

  for (const rel of (self.relations ?? [])) {
    if (rel.type !== 'enemy' && rel.type !== 'rival') continue

    const other = orgs.find(o => o.id === rel.organization_id)
    if (!other) continue

    const otherPower = powerRatings[other.id] ?? 0
    const ratio = otherPower / Math.max(1, selfPower)

    let level: ThreatLevel
    if (ratio >= THREAT_POWER_RATIO_CRITICAL) level = 'critical'
    else if (ratio >= THREAT_POWER_RATIO_HIGH) level = 'high'
    else if (ratio >= THREAT_POWER_RATIO_MEDIUM) level = 'medium'
    else if (ratio >= 0.5) level = 'low'
    else level = 'negligible'

    threats.push({
      source_org_id: other.id,
      level,
      type: rel.type === 'enemy' ? 'military' : 'diplomatic',
      description: `${other.name}（${rel.type === 'enemy' ? '敌对' : '竞争'}关系）`,
      estimated_power: otherPower,
    })
  }

  return threats.sort((a, b) => {
    const order: Record<ThreatLevel, number> = { critical: 5, high: 4, medium: 3, low: 2, negligible: 1 }
    return order[b.level] - order[a.level]
  })
}

// ─── 权力平衡 ───

function assessPowerBalance(
  self: { id: string },
  orgs: Array<{ id: string }>,
  powerRatings: Record<string, number>,
): PowerBalance {
  const selfPower = powerRatings[self.id] ?? 0
  const sortedOrgs = [...orgs].sort((a, b) => (powerRatings[b.id] ?? 0) - (powerRatings[a.id] ?? 0))
  const strongestRival = sortedOrgs.find(o => o.id !== self.id)
  const strongestRivalPower = strongestRival ? (powerRatings[strongestRival.id] ?? 0) : 0

  const ratio = strongestRivalPower > 0 ? selfPower / strongestRivalPower : 2

  let position: PowerBalance['position']
  if (ratio > 1.5) position = 'dominant'
  else if (ratio > 1.1) position = 'strong'
  else if (ratio > 0.8) position = 'balanced'
  else if (ratio > 0.5) position = 'weak'
  else position = 'vulnerable'

  return {
    self_power: selfPower,
    strongest_rival_power: strongestRivalPower,
    power_ratio: ratio,
    position,
  }
}

// ─── 机会评估 ───

function assessOpportunities(
  self: { id: string; personality?: OrgPersonality; relations: Array<{ organization_id: string; type: string; strength: number }> },
  orgs: Array<{ id: string; name: string; status: string; military_strength: number; cohesion: number }>,
  powerRatings: Record<string, number>,
  personality?: OrgPersonality,
): Opportunity[] {
  const opportunities: Opportunity[] = []
  const selfPower = powerRatings[self.id] ?? 0

  for (const other of orgs) {
    if (other.id === self.id) continue
    const otherPower = powerRatings[other.id] ?? 0

    // 衰弱中的组织 → 扩张机会
    if (other.status === 'declining' && selfPower > otherPower * 0.8) {
      opportunities.push({
        type: 'expansion',
        target_org_id: other.id,
        description: `${other.name} 正在衰退，可能成为扩张目标`,
        urgency: 0.6,
      })
    }

    // 弱小组织 → 附庸机会
    if (otherPower < selfPower * 0.3 && other.cohesion < 40) {
      opportunities.push({
        type: 'subjugation',
        target_org_id: other.id,
        description: `${other.name} 极度虚弱，可能被附庸`,
        urgency: 0.4,
      })
    }

    // 无关系的中等组织 → 结盟机会
    const rel = (self.relations ?? []).find(r => r.organization_id === other.id)
    if (!rel && personality && personality.openness > 50) {
      opportunities.push({
        type: 'alliance',
        target_org_id: other.id,
        description: `${other.name} 是潜在的结盟对象`,
        urgency: 0.3,
      })
    }
  }

  return opportunities.sort((a, b) => b.urgency - a.urgency).slice(0, 5)
}

// ─── 内部裂痕 ───

function assessFaultLines(
  self: { cohesion: number; resources?: number; territory?: string[]; military_strength: number; status: string },
): FaultLine[] {
  const faultLines: FaultLine[] = []

  // 凝聚力危机
  if (self.cohesion < 30) {
    faultLines.push({
      type: 'internal_conflict',
      description: `凝聚力极低（${self.cohesion.toFixed(0)}），面临分裂风险`,
      severity: (30 - self.cohesion) / 30,
    })
  }

  // 资源稀缺
  if (typeof self.resources === 'number' && self.resources < 15) {
    faultLines.push({
      type: 'resource_scarcity',
      description: `资源即将耗竭（${self.resources.toFixed(0)}），经济面临崩溃`,
      severity: (15 - self.resources) / 15,
    })
  }

  // 领土过度扩张
  const territoryCount = self.territory?.length ?? 0
  if (territoryCount > 5 && self.military_strength < territoryCount * 8) {
    faultLines.push({
      type: 'territorial_overstretch',
      description: `领地过多（${territoryCount}块）而军力不足以防守`,
      severity: Math.min(1, (territoryCount * 8 - self.military_strength) / (territoryCount * 8)),
    })
  }

  // 状态衰退
  if (self.status === 'declining') {
    faultLines.push({
      type: 'loyalty_crisis',
      description: '组织处于衰退状态，内部人心不稳',
      severity: 0.5,
    })
  }

  return faultLines.sort((a, b) => b.severity - a.severity)
}

// ─── 姿态建议 ───

function recommendPosture(
  personality: OrgPersonality | undefined,
  threats: Threat[],
  powerBalance: PowerBalance,
  faultLines: FaultLine[],
): StrategicAnalysis['recommended_posture'] {
  // 有严重内部问题 → 整合
  const hasSevereFaultLines = faultLines.some(f => f.severity > 0.6)
  if (hasSevereFaultLines) return 'consolidating'

  // 严重威胁 → 防御
  const hasCriticalThreat = threats.some(t => t.level === 'critical' || t.level === 'high')
  if (hasCriticalThreat) return 'defensive'

  // 优势地位 → 扩张
  if (powerBalance.position === 'dominant' || powerBalance.position === 'strong') {
    if (personality && personality.aggression > 60) return 'aggressive'
    return 'expansionist'
  }

  // 劣势 → 外交
  if (powerBalance.position === 'weak' || powerBalance.position === 'vulnerable') {
    return 'diplomatic'
  }

  // 均势 → 取决于性格
  if (personality) {
    if (personality.aggression > 60) return 'aggressive'
    if (personality.openness > 60) return 'diplomatic'
  }

  return 'consolidating'
}

// ─── 摘要生成 ───

function generateAnalysisSummary(
  self: { name: string },
  threats: Threat[],
  powerBalance: PowerBalance,
  opportunities: Opportunity[],
  faultLines: FaultLine[],
  posture: string,
): string {
  const parts: string[] = []

  // 权力位置
  const positionNames: Record<string, string> = {
    dominant: '霸主地位',
    strong: '强势地位',
    balanced: '均衡地位',
    weak: '弱势地位',
    vulnerable: '危急地位',
  }
  parts.push(`${self.name} 处于${positionNames[posture] ?? posture}态势`)

  // 主要威胁
  if (threats.length > 0) {
    const topThreat = threats[0]
    parts.push(`最大威胁来自${topThreat.description}（${topThreat.level}级别）`)
  }

  // 内部问题
  if (faultLines.length > 0) {
    parts.push(`内部隐患：${faultLines[0].description}`)
  }

  // 机会
  if (opportunities.length > 0) {
    parts.push(`最佳机会：${opportunities[0].description}`)
  }

  return parts.join('。')
}

function createEmptyAnalysis(orgId: string, tick: number): StrategicAnalysis {
  return {
    org_id: orgId,
    tick,
    threats: [],
    power_balance: { self_power: 0, strongest_rival_power: 0, power_ratio: 1, position: 'balanced' },
    opportunities: [],
    fault_lines: [],
    recommended_posture: 'consolidating',
    summary: '数据不足，无法分析',
  }
}

/**
 * 格式化战略分析为 LLM 上下文
 */
export function formatStrategicAnalysisForLLM(analysis: StrategicAnalysis): string {
  const lines = [analysis.summary]

  if (analysis.threats.length > 0) {
    lines.push(`威胁：${analysis.threats.map(t => `${t.description}(${t.level})`).join('、')}`)
  }

  if (analysis.opportunities.length > 0) {
    lines.push(`机会：${analysis.opportunities.map(o => o.description).join('、')}`)
  }

  if (analysis.fault_lines.length > 0) {
    lines.push(`隐患：${analysis.fault_lines.map(f => f.description).join('、')}`)
  }

  lines.push(`建议姿态：${analysis.recommended_posture}`)

  return lines.join('\n')
}
