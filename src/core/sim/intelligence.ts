/**
 * 情报/战争迷雾系统
 *
 * 组织不能看到世界的全部真相
 * 信息获取取决于：直接接触、情报资源、关系偏差、间谍活动
 */

import type { OrgPersonality } from './org-personality'
import type { OrgReputation } from './org-reputation'

// ─── 类型定义 ───

export type IntelligenceLevel = 'none' | 'vague' | 'partial' | 'accurate' | 'detailed'

export type IntelSource = 'direct_contact' | 'trade' | 'alliance' | 'spy' | 'rumor' | 'observation'

export type IntelReport = {
  target_org_id: string
  source: IntelSource
  level: IntelligenceLevel
  data: {
    military_strength?: number
    economic_power?: number
    cohesion?: number
    influence_score?: number
    territory_count?: number
    recent_actions?: string[]
    internal_conflicts?: string[]
    alliance_info?: string[]
  }
  confidence: number    // [0, 1]
  age_ticks: number     // 信息年龄
  collected_tick: number
}

export type SpyMission = {
  id: string
  agent_org_id: string
  target_org_id: string
  mission_type: 'infiltrate' | 'sabotage' | 'steal_tech' | 'assassinate'
  duration_ticks: number
  start_tick: number
  success_chance: number
  status: 'active' | 'completed' | 'failed' | 'detected'
  result?: string
}

// ─── 常量 ───

const INTEL_LEVEL_BY_SOURCE: Record<IntelSource, IntelligenceLevel> = {
  direct_contact: 'accurate',
  trade: 'partial',
  alliance: 'detailed',
  spy: 'detailed',
  rumor: 'vague',
  observation: 'partial',
}

const INTEL_CONFIDENCE_BY_SOURCE: Record<IntelSource, number> = {
  direct_contact: 0.8,
  trade: 0.5,
  alliance: 0.9,
  spy: 0.85,
  rumor: 0.2,
  observation: 0.6,
}

const INTEL_AGE_DECAY_RATE = 0.05        // 每 tick 信息置信度衰减
const SPY_BASE_SUCCESS_RATE = 0.4
const SPY_DETECTION_BASE_RATE = 0.15
const INTELLIGENCE_COST_PER_SPY = 10

// ─── 情报收集 ───

/**
 * 收集关于目标组织的情报
 */
export function collectIntelligence(
  observerOrgId: string,
  targetOrgId: string,
  relations: Array<{ organization_id: string; type: string; strength: number }>,
  intelligenceResource: number,
  personality: OrgPersonality,
  currentTick: number,
): IntelReport {
  const rel = relations.find(r => r.organization_id === targetOrgId)

  // 确定情报来源和级别
  let source: IntelSource = 'observation'
  let level: IntelligenceLevel = 'partial'
  let confidence = INTEL_CONFIDENCE_BY_SOURCE.observation

  if (rel) {
    if (rel.type === 'ally') {
      source = 'alliance'
      level = 'detailed'
      confidence = INTEL_CONFIDENCE_BY_SOURCE.alliance
    } else if (rel.type === 'trading_partner') {
      source = 'trade'
      level = 'partial'
      confidence = INTEL_CONFIDENCE_BY_SOURCE.trade
    } else if (rel.type === 'enemy') {
      // 敌人：低情报，但可能有间谍
      source = 'rumor'
      level = 'vague'
      confidence = INTEL_CONFIDENCE_BY_SOURCE.rumor

      // 如果有足够情报资源，可以派间谍
      if (intelligenceResource >= INTELLIGENCE_COST_PER_SPY) {
        source = 'spy'
        level = 'detailed'
        confidence = INTEL_CONFIDENCE_BY_SOURCE.spy
      }
    } else {
      source = 'direct_contact'
      level = 'accurate'
      confidence = INTEL_CONFIDENCE_BY_SOURCE.direct_contact
    }
  }

  // 情报资源加成
  const resourceBonus = Math.min(0.2, intelligenceResource * 0.005)
  confidence = Math.min(1, confidence + resourceBonus)

  // 开放性加成（更开放的组织获取信息更容易）
  const opennessBonus = (personality.openness - 50) * 0.002
  confidence = Math.min(1, Math.max(0.1, confidence + opennessBonus))

  return {
    target_org_id: targetOrgId,
    source,
    level,
    data: {}, // 实际数据需要从世界状态中读取并按级别过滤
    confidence,
    age_ticks: 0,
    collected_tick: currentTick,
  }
}

/**
 * 按情报级别过滤数据
 */
export function filterDataByIntelLevel(
  realData: {
    military_strength: number
    economic_power: number
    cohesion: number
    influence_score: number
    territory_count: number
  },
  level: IntelligenceLevel,
  confidence: number,
): typeof realData {
  // 添加噪音模拟情报不准确
  const noise = (1 - confidence) * 0.3

  const addNoise = (value: number): number => {
    const jitter = value * noise * (Math.random() * 2 - 1)
    return Math.max(0, Math.round(value + jitter))
  }

  switch (level) {
    case 'none':
      return { military_strength: 0, economic_power: 0, cohesion: 0, influence_score: 0, territory_count: 0 }
    case 'vague':
      return {
        military_strength: addNoise(realData.military_strength * 0.5),
        economic_power: addNoise(realData.economic_power * 0.3),
        cohesion: 0,
        influence_score: addNoise(realData.influence_score * 0.4),
        territory_count: Math.max(1, addNoise(realData.territory_count * 0.6)),
      }
    case 'partial':
      return {
        military_strength: addNoise(realData.military_strength * 0.8),
        economic_power: addNoise(realData.economic_power * 0.7),
        cohesion: addNoise(realData.cohesion * 0.5),
        influence_score: addNoise(realData.influence_score * 0.8),
        territory_count: addNoise(realData.territory_count),
      }
    case 'accurate':
      return {
        military_strength: addNoise(realData.military_strength),
        economic_power: addNoise(realData.economic_power),
        cohesion: addNoise(realData.cohesion * 0.8),
        influence_score: addNoise(realData.influence_score),
        territory_count: realData.territory_count,
      }
    case 'detailed':
      return { ...realData }
  }
}

// ─── 间谍任务 ───

/**
 * 创建间谍任务
 */
export function createSpyMission(
  id: string,
  agentOrgId: string,
  targetOrgId: string,
  missionType: SpyMission['mission_type'],
  intelligenceResource: number,
  currentTick: number,
): SpyMission | null {
  if (intelligenceResource < INTELLIGENCE_COST_PER_SPY) return null

  const baseChance = SPY_BASE_SUCCESS_RATE
  const resourceBonus = Math.min(0.3, intelligenceResource * 0.005)

  const durationMap: Record<SpyMission['mission_type'], number> = {
    infiltrate: 5,
    sabotage: 3,
    steal_tech: 4,
    assassinate: 2,
  }

  return {
    id,
    agent_org_id: agentOrgId,
    target_org_id: targetOrgId,
    mission_type: missionType,
    duration_ticks: durationMap[missionType],
    start_tick: currentTick,
    success_chance: Math.min(0.9, baseChance + resourceBonus),
    status: 'active',
  }
}

/**
 * 推进间谍任务
 */
export function advanceSpyMission(
  mission: SpyMission,
  targetPersonality: OrgPersonality,
  currentTick: number,
): SpyMission {
  if (mission.status !== 'active') return mission

  const elapsed = currentTick - mission.start_tick
  if (elapsed < mission.duration_ticks) return mission

  // 任务完成 — 判定成功/失败
  const detectionResistance = (targetPersonality.centralization / 100) * 0.3
  const actualSuccessChance = Math.max(0.1, mission.success_chance - detectionResistance)

  if (Math.random() < actualSuccessChance) {
    return { ...mission, status: 'completed', result: `${mission.mission_type} 成功` }
  } else {
    // 被发现的概率
    const detected = Math.random() < SPY_DETECTION_BASE_RATE + detectionResistance
    return {
      ...mission,
      status: detected ? 'detected' : 'failed',
      result: detected ? `${mission.mission_type} 失败并被发现` : `${mission.mission_type} 失败`,
    }
  }
}

/**
 * 情报衰减 — 每 tick 降低旧情报的置信度
 */
export function decayIntelligence(reports: IntelReport[], currentTick: number): IntelReport[] {
  return reports
    .map(report => ({
      ...report,
      age_ticks: currentTick - report.collected_tick,
      confidence: Math.max(0.05, report.confidence - (currentTick - report.collected_tick) * INTEL_AGE_DECAY_RATE),
    }))
    .filter(report => report.confidence > 0.05) // 置信度过低则丢弃
}

/**
 * 格式化情报为 LLM 上下文（模拟组织的"感知世界"）
 */
export function formatIntelligenceForLLM(
  orgName: string,
  reports: IntelReport[],
  allOrgs: Array<{ id: string; name: string }>,
): string {
  if (reports.length === 0) return `${orgName} 没有情报`

  const levelNames: Record<IntelligenceLevel, string> = {
    none: '无信息',
    vague: '模糊传闻',
    partial: '部分了解',
    accurate: '准确情报',
    detailed: '详细掌握',
  }

  const lines = reports
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map(report => {
      const targetName = allOrgs.find(o => o.id === report.target_org_id)?.name ?? '未知'
      return `- ${targetName}：${levelNames[report.level]}（置信度 ${(report.confidence * 100).toFixed(0)}%，来源:${report.source}）`
    })

  return `${orgName} 的情报：\n${lines.join('\n')}`
}
