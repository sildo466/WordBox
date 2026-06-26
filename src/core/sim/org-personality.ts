/**
 * 组织性格系统
 *
 * 每个组织拥有 5 维性格参数，驱动策略偏好、外交态度、资源分配和危机反应。
 * 性格参数会随事件缓慢漂移，但有惯性（变化速率受组织凝聚力调节）。
 */

// ─── 类型定义 ───

/**
 * 组织性格五维度
 * 每个维度范围 [0, 100]，默认 50（中性）
 */
export type OrgPersonality = {
  /** 好战性: 0=和平主义 ↔ 100=穷兵黩武 */
  aggression: number
  /** 开放性: 0=封闭排外 ↔ 100=兼容并蓄 */
  openness: number
  /** 实用性: 0=理想主义 ↔ 100=实用至上 */
  pragmatism: number
  /** 集权度: 0=分权松散 ↔ 100=高度集权 */
  centralization: number
  /** 传统度: 0=激进革新 ↔ 100=因循守旧 */
  tradition: number
}

/** 组织性格影响的策略类型 */
export type StrategyProfile = {
  diplomacy_style: 'aggressive' | 'assertive' | 'balanced' | 'conciliatory' | 'isolationist'
  war_readiness: 'eager' | 'prepared' | 'cautious' | 'reluctant' | 'pacifist'
  economic_policy: 'mercantile' | 'balanced' | 'autarkic' | 'redistributive'
  governance: 'authoritarian' | 'hierarchical' | 'consensus' | 'decentralized' | 'anarchic'
  cultural_stance: 'expansionist' | 'open' | 'selective' | 'preservationist' | 'isolationist'
}

// ─── 默认值 ───

export const DEFAULT_ORG_PERSONALITY: OrgPersonality = {
  aggression: 50,
  openness: 50,
  pragmatism: 50,
  centralization: 50,
  tradition: 50,
}

// ─── 性格漂移规则 ───

/**
 * 事件类型 → 组织性格漂移映射
 * 每个事件类型定义对各个维度的影响量
 */
const ORG_PERSONALITY_DRIFT: Record<string, Partial<Record<keyof OrgPersonality, number>>> = {
  // 冲突/战斗 → 好战性上升，集权度上升
  battle: { aggression: 0.3, centralization: 0.15 },
  rebellion: { aggression: 0.15, centralization: -0.2, openness: 0.1 },
  // 背叛 → 好战性微升，开放性下降，传统度上升（保守化）
  betrayal: { aggression: 0.1, openness: -0.15, tradition: 0.1 },
  // 贸易 → 开放性上升，实用性上升
  trade: { openness: 0.15, pragmatism: 0.1 },
  // 联盟/谈判 → 开放性上升，好战性下降
  alliance: { openness: 0.1, aggression: -0.1 },
  negotiation: { openness: 0.08, pragmatism: 0.12 },
  // 灾难 → 集权度上升，传统度上升（求稳）
  disaster: { centralization: 0.2, tradition: 0.15 },
  // 发现 → 开放性上升，传统度下降
  discovery: { openness: 0.2, tradition: -0.1 },
  // 仪式 → 传统度上升，集权度微升
  ritual: { tradition: 0.15, centralization: 0.05 },
  // 谣言 → 开放性下降
  rumor: { openness: -0.05 },
  // 迁移 → 开放性上升
  migration: { openness: 0.1 },
  // 暗杀 → 好战性上升，集权度上升，开放性下降
  assassination: { aggression: 0.15, centralization: 0.2, openness: -0.1 },
  // 神命令 → 集权度上升（服从权威）
  god_command: { centralization: 0.1 },
  // 经济增长 → 实用性上升，开放性微升
  economic_growth: { pragmatism: 0.08, openness: 0.05 },
  // 经济衰退 → 好战性上升，开放性下降
  economic_decline: { aggression: 0.1, openness: -0.08 },
  // 胜利 → 好战性上升
  victory: { aggression: 0.15 },
  // 失败 → 好战性下降，实用性上升
  defeat: { aggression: -0.1, pragmatism: 0.1 },
  // 文化交流 → 开放性上升，传统度下降
  cultural_exchange: { openness: 0.12, tradition: -0.08 },
  // 技术进步 → 开放性上升，传统度下降
  technology: { openness: 0.1, tradition: -0.1, pragmatism: 0.05 },
}

// ─── 核心函数 ───

/**
 * 创建默认组织性格
 */
export function createOrgPersonality(partial?: Partial<OrgPersonality>): OrgPersonality {
  return {
    ...DEFAULT_ORG_PERSONALITY,
    ...partial,
  }
}

/**
 * 根据组织类型推断初始性格偏向
 */
export function inferPersonalityFromType(orgType: string): Partial<OrgPersonality> {
  switch (orgType) {
    case 'kingdom':
    case 'empire':
      return { centralization: 70, tradition: 65, aggression: 55 }
    case 'republic':
      return { openness: 65, pragmatism: 60, centralization: 35 }
    case 'tribe':
      return { tradition: 70, centralization: 30, openness: 40 }
    case 'guild':
      return { pragmatism: 70, openness: 55, aggression: 30, centralization: 45 }
    case 'church':
      return { tradition: 80, openness: 35, aggression: 25, centralization: 60 }
    case 'merchant_company':
      return { pragmatism: 80, openness: 60, aggression: 35, centralization: 50 }
    case 'criminal_syndicate':
      return { pragmatism: 75, openness: 40, aggression: 60, centralization: 55, tradition: 35 }
    case 'secret_society':
      return { openness: 20, centralization: 75, tradition: 60, pragmatism: 55 }
    case 'mercenary_band':
      return { aggression: 75, pragmatism: 65, openness: 50, centralization: 40, tradition: 30 }
    default:
      return {}
  }
}

/**
 * 根据意识形态推断性格偏向
 */
export function inferPersonalityFromIdeology(ideology: string): Partial<OrgPersonality> {
  const lower = ideology.toLowerCase()
  const result: Partial<OrgPersonality> = {}

  // 好战关键词
  if (/战争|征服|军事|扩张|war|conquest|military|expansion/.test(lower)) {
    result.aggression = 70
  }
  // 和平关键词
  if (/和平|外交|协商|peace|diplomacy|negotiation/.test(lower)) {
    result.aggression = 30
  }
  // 开放关键词
  if (/开放|包容|多元|open|inclusive|diverse/.test(lower)) {
    result.openness = 70
  }
  // 封闭关键词
  if (/封闭|排外|纯净|closed|exclusive|purist/.test(lower)) {
    result.openness = 30
  }
  // 宗教/传统关键词
  if (/宗教|信仰|传统|神圣|religion|faith|tradition|sacred/.test(lower)) {
    result.tradition = 70
    result.openness = 35
  }
  // 革新关键词
  if (/革新|进步|科技|创新|innovation|progress|technology/.test(lower)) {
    result.tradition = 30
    result.openness = 65
  }
  // 集权关键词
  if (/集权|独裁|权威|centralize|authoritarian|authority/.test(lower)) {
    result.centralization = 75
  }
  // 分权关键词
  if (/民主|自治|分权|democratic|autonomy|decentralize/.test(lower)) {
    result.centralization = 30
  }

  return result
}

/**
 * 应用事件驱动的性格漂移
 *
 * @param personality 当前性格
 * @param eventType 事件类型
 * @param cohesion 组织凝聚力（影响漂移速率：凝聚力越高，变化越慢）
 * @returns 漂移后的性格（已 clamp）
 */
export function applyOrgPersonalityDrift(
  personality: OrgPersonality,
  eventType: string,
  cohesion: number,
): OrgPersonality {
  const drift = ORG_PERSONALITY_DRIFT[eventType]
  if (!drift) return personality

  // 凝聚力调节：高凝聚力 = 低变化率（组织更稳定，性格变化慢）
  // cohesion: 0-100, rate: 0.3 (低凝聚力) ↔ 0.7 (高凝聚力)
  const stabilityRate = 0.3 + (cohesion / 100) * 0.4

  const result = { ...personality }
  for (const [key, delta] of Object.entries(drift)) {
    if (delta == null) continue
    const k = key as keyof OrgPersonality
    const current = result[k] ?? 50
    // 漂移量 × 稳定性系数
    const adjustedDelta = (delta as number) * (1 - stabilityRate * 0.5)
    result[k] = Math.max(0, Math.min(100, current + adjustedDelta))
  }

  return result
}

/**
 * 从性格推导策略偏好
 */
export function deriveStrategyProfile(personality: OrgPersonality): StrategyProfile {
  const { aggression, openness, pragmatism, centralization, tradition } = personality

  // 外交风格
  let diplomacy_style: StrategyProfile['diplomacy_style']
  if (aggression > 70) diplomacy_style = 'aggressive'
  else if (aggression > 55) diplomacy_style = 'assertive'
  else if (aggression < 30) diplomacy_style = 'conciliatory'
  else if (openness < 30) diplomacy_style = 'isolationist'
  else diplomacy_style = 'balanced'

  // 战争准备度
  let war_readiness: StrategyProfile['war_readiness']
  if (aggression > 75) war_readiness = 'eager'
  else if (aggression > 55) war_readiness = 'prepared'
  else if (aggression < 25) war_readiness = 'pacifist'
  else if (aggression < 40) war_readiness = 'reluctant'
  else war_readiness = 'cautious'

  // 经济政策
  let economic_policy: StrategyProfile['economic_policy']
  if (pragmatism > 70 && openness > 50) economic_policy = 'mercantile'
  else if (openness < 30) economic_policy = 'autarkic'
  else if (pragmatism < 30) economic_policy = 'redistributive'
  else economic_policy = 'balanced'

  // 治理方式
  let governance: StrategyProfile['governance']
  if (centralization > 75) governance = 'authoritarian'
  else if (centralization > 60) governance = 'hierarchical'
  else if (centralization < 25) governance = 'anarchic'
  else if (centralization < 40) governance = 'decentralized'
  else governance = 'consensus'

  // 文化立场
  let cultural_stance: StrategyProfile['cultural_stance']
  if (openness > 70 && tradition < 40) cultural_stance = 'expansionist'
  else if (openness > 60) cultural_stance = 'open'
  else if (openness < 30 && tradition > 60) cultural_stance = 'isolationist'
  else if (tradition > 65) cultural_stance = 'preservationist'
  else cultural_stance = 'selective'

  return { diplomacy_style, war_readiness, economic_policy, governance, cultural_stance }
}

/**
 * 生成性格的自然语言描述
 */
export function describePersonality(personality: OrgPersonality): string {
  const parts: string[] = []

  if (personality.aggression > 65) parts.push('好战')
  else if (personality.aggression < 35) parts.push('和平')

  if (personality.openness > 65) parts.push('开放')
  else if (personality.openness < 35) parts.push('封闭')

  if (personality.pragmatism > 65) parts.push('务实')
  else if (personality.pragmatism < 35) parts.push('理想主义')

  if (personality.centralization > 65) parts.push('集权')
  else if (personality.centralization < 35) parts.push('分权')

  if (personality.tradition > 65) parts.push('守旧')
  else if (personality.tradition < 35) parts.push('激进')

  return parts.length > 0 ? parts.join('、') : '中庸'
}
