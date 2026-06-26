/**
 * 组织外交谈判引擎
 *
 * 类比对话场景：组织间通过多轮谈判达成条约或破裂
 * 谈判策略由组织性格驱动，结果影响关系和条约
 */

import type { OrgPersonality } from './org-personality'
import type { OrgReputation } from './org-reputation'

// ─── 类型定义 ───

export type TreatyType =
  | 'trade_agreement'      // 贸易协定
  | 'non_aggression'       // 互不侵犯
  | 'military_alliance'    // 军事同盟
  | 'vassalage'            // 附庸
  | 'cultural_exchange'    // 文化交流
  | 'territory_swap'       // 领土交换
  | 'ceasefire'            // 停火
  | 'joint_war'            // 联合宣战

export type Treaty = {
  id: string
  type: TreatyType
  parties: [string, string]     // 两个组织 ID
  terms: string                 // 条约内容描述
  signed_tick: number
  expiry_tick: number | null    // null = 永久
  strength: number              // [0, 1] — 条约强度
  status: 'active' | 'violated' | 'expired' | 'renegotiated'
}

export type NegotiationRound = {
  round_number: number
  proposer_id: string
  proposal: string
  response: 'accept' | 'counter' | 'reject' | 'threaten' | 'concede'
  response_detail: string
  mood_shift: number  // [-1, 1] — 谈判氛围变化
}

export type NegotiationSession = {
  id: string
  initiator_id: string
  responder_id: string
  trigger: string           // 触发原因
  rounds: NegotiationRound[]
  max_rounds: number
  result: Treaty | null
  status: 'ongoing' | 'agreed' | 'broken' | 'timeout'
  start_tick: number
}

export type NegotiationProposal = {
  treaty_type: TreatyType
  terms: string
  concessions: string[]      // 提议方愿意做出的让步
  demands: string[]          // 提议方要求对方做的事
}

// ─── 常量 ───

const MAX_NEGOTIATION_ROUNDS = 6
const TREATY_BASE_DURATION = 50 // 基础条约持续 tick 数

// 外交触发阈值
const DIPLOMACY_TRIGGERS = {
  territory_dispute: 0.6,      // 领土争端压力
  trade_need: 0.5,             // 贸易需求
  military_threat: 0.7,        // 军事威胁
  ideological_conflict: 0.5,   // 意识形态冲突
  mediation_request: 0.4,      // 第三方调停
}

// ─── 谈判策略（由性格驱动）───

/**
 * 根据组织性格选择谈判策略
 */
export function selectNegotiationStrategy(
  personality: OrgPersonality,
  reputation: OrgReputation,
  powerRatio: number, // 本方力量 / 对方力量
): {
  opening_stance: 'demanding' | 'firm' | 'fair' | 'generous' | 'desperate'
  flexibility: number        // [0, 1] — 让步意愿
  threat_willingness: number // [0, 1] — 使用威胁的意愿
  walk_away_threshold: number // [0, 1] — 最低可接受条件
} {
  const { aggression, openness, pragmatism, centralization } = personality

  // 开场立场
  let opening_stance: 'demanding' | 'firm' | 'fair' | 'generous' | 'desperate'
  if (powerRatio > 1.5 && aggression > 60) opening_stance = 'demanding'
  else if (powerRatio > 1.2) opening_stance = 'firm'
  else if (powerRatio < 0.6) opening_stance = 'desperate'
  else if (openness > 60) opening_stance = 'generous'
  else opening_stance = 'fair'

  // 让步意愿 = 开放性 × 实用性 / 好战性
  const flexibility = Math.max(0, Math.min(1,
    (openness / 100) * 0.4 + (pragmatism / 100) * 0.4 - (aggression / 100) * 0.2 + 0.2
  ))

  // 威胁意愿 = 好战性 × 集权度 × 军事威望
  const threat_willingness = Math.max(0, Math.min(1,
    (aggression / 100) * 0.5 + (centralization / 100) * 0.2 + (reputation.military_prowess / 100) * 0.3
  ))

  // 最低可接受条件 = 实用性调节
  const walk_away_threshold = Math.max(0.1, Math.min(0.9,
    0.5 - (pragmatism / 100) * 0.3 + (aggression / 100) * 0.2
  ))

  return { opening_stance, flexibility, threat_willingness, walk_away_threshold }
}

// ─── 谈判模拟 ───

/**
 * 模拟一轮谈判
 */
export function simulateNegotiationRound(
  session: NegotiationSession,
  initiatorPersonality: OrgPersonality,
  responderPersonality: OrgPersonality,
  initiatorPower: number,
  responderPower: number,
  currentTick: number,
): NegotiationRound {
  const roundNumber = session.rounds.length + 1
  const powerRatio = initiatorPower / Math.max(1, responderPower)

  // 根据轮次和性格决定提议
  const initiatorStrategy = selectNegotiationStrategy(
    initiatorPersonality,
    { military_prowess: initiatorPower, economic_reliability: 50, diplomatic_trust: 50, cultural_prestige: 50, internal_stability: 50 },
    powerRatio,
  )

  // 前几轮用开场立场，后面根据让步意愿调整
  const concessionProgress = roundNumber / session.max_rounds
  const initiatorFlex = initiatorStrategy.flexibility * concessionProgress

  // 生成提议
  let proposal: string
  if (roundNumber === 1) {
    proposal = generateOpeningProposal(initiatorStrategy.opening_stance, session.trigger)
  } else {
    proposal = generateFollowUpProposal(initiatorFlex, session.rounds)
  }

  // 回应方评估
  const responderStrategy = selectNegotiationStrategy(
    responderPersonality,
    { military_prowess: responderPower, economic_reliability: 50, diplomatic_trust: 50, cultural_prestige: 50, internal_stability: 50 },
    1 / powerRatio,
  )

  const { response, detail, moodShift } = evaluateProposal(
    proposal,
    responderStrategy,
    roundNumber,
    session.max_rounds,
    session.rounds,
  )

  return {
    round_number: roundNumber,
    proposer_id: session.initiator_id,
    proposal,
    response,
    response_detail: detail,
    mood_shift: moodShift,
  }
}

/**
 * 评估谈判结果
 */
export function evaluateNegotiationResult(
  session: NegotiationSession,
): { treaty: Treaty | null; status: NegotiationSession['status'] } {
  const lastRound = session.rounds[session.rounds.length - 1]
  if (!lastRound) return { treaty: null, status: 'timeout' }

  // 累计氛围
  const totalMood = session.rounds.reduce((sum, r) => sum + r.mood_shift, 0)

  // 接受 → 生成条约
  if (lastRound.response === 'accept') {
    return {
      treaty: createTreaty(session, totalMood),
      status: 'agreed',
    }
  }

  // 让步 → 可能达成
  if (lastRound.response === 'concede' && totalMood > 0) {
    return {
      treaty: createTreaty(session, totalMood * 0.7),
      status: 'agreed',
    }
  }

  // 拒绝或超时
  if (lastRound.response === 'reject' || session.rounds.length >= session.max_rounds) {
    return { treaty: null, status: 'broken' }
  }

  // 威胁 → 可能破裂或让步
  if (lastRound.response === 'threaten' && totalMood < -0.5) {
    return { treaty: null, status: 'broken' }
  }

  return { treaty: null, status: 'ongoing' }
}

// ─── 辅助函数 ───

function generateOpeningProposal(stance: string, trigger: string): string {
  const stanceText: Record<string, string> = {
    demanding: '强硬要求',
    firm: '坚定提出',
    fair: '诚恳提议',
    generous: '慷慨让步',
    desperate: '迫切请求',
  }
  return `${stanceText[stance] ?? '提出'}关于${trigger}的谈判方案`
}

function generateFollowUpProposal(flexibility: number, previousRounds: NegotiationRound[]): string {
  if (flexibility > 0.7) return '做出重大让步，提出新方案'
  if (flexibility > 0.4) return '做出部分让步，调整条件'
  if (flexibility > 0.2) return '小幅调整立场'
  return '坚持原有立场，不做实质让步'
}

function evaluateProposal(
  proposal: string,
  strategy: ReturnType<typeof selectNegotiationStrategy>,
  roundNumber: number,
  maxRounds: number,
  previousRounds: NegotiationRound[],
): { response: NegotiationRound['response']; detail: string; moodShift: number } {
  // 前几轮通常不会直接接受
  if (roundNumber <= 2) {
    if (strategy.flexibility > 0.7) {
      return { response: 'counter', detail: '表示兴趣，提出反提案', moodShift: 0.1 }
    }
    return { response: 'counter', detail: '审慎回应，提出对等条件', moodShift: 0 }
  }

  // 中间轮次
  const timePressure = roundNumber / maxRounds
  const acceptChance = strategy.flexibility * timePressure + (1 - strategy.walk_away_threshold) * 0.3

  if (acceptChance > 0.7) {
    return { response: 'accept', detail: '接受提案', moodShift: 0.3 }
  }

  if (strategy.threat_willingness > 0.7 && timePressure > 0.5) {
    return { response: 'threaten', detail: '发出最后通牒', moodShift: -0.3 }
  }

  if (strategy.flexibility > 0.5) {
    return { response: 'concede', detail: '做出让步以推动进展', moodShift: 0.15 }
  }

  // 最后一轮
  if (roundNumber >= maxRounds - 1) {
    if (acceptChance > 0.4) {
      return { response: 'accept', detail: '在时间压力下接受', moodShift: 0.1 }
    }
    return { response: 'reject', detail: '无法达成一致', moodShift: -0.2 }
  }

  return { response: 'counter', detail: '提出对等方案', moodShift: 0 }
}

function createTreaty(session: NegotiationSession, moodScore: number): Treaty {
  const strength = Math.max(0.2, Math.min(1, 0.5 + moodScore * 0.3))
  const duration = Math.round(TREATY_BASE_DURATION * (0.5 + strength * 0.5))

  return {
    id: `treaty_${session.id}`,
    type: inferTreatyType(session.trigger),
    parties: [session.initiator_id, session.responder_id],
    terms: `基于${session.trigger}的谈判结果`,
    signed_tick: session.start_tick + session.rounds.length,
    expiry_tick: duration > 0 ? session.start_tick + session.rounds.length + duration : null,
    strength,
    status: 'active',
  }
}

function inferTreatyType(trigger: string): TreatyType {
  if (/贸易|经济|trade|economic/.test(trigger)) return 'trade_agreement'
  if (/军事|同盟|military|alliance/.test(trigger)) return 'military_alliance'
  if (/领土|territory/.test(trigger)) return 'territory_swap'
  if (/停战|和平|ceasefire|peace/.test(trigger)) return 'ceasefire'
  if (/文化|cultural/.test(trigger)) return 'cultural_exchange'
  if (/附庸|vassal/.test(trigger)) return 'vassalage'
  if (/联合|joint/.test(trigger)) return 'joint_war'
  return 'non_aggression'
}

/**
 * 检查条约状态
 */
export function checkTreatyStatus(treaty: Treaty, currentTick: number): Treaty {
  if (treaty.status !== 'active') return treaty
  if (treaty.expiry_tick != null && currentTick >= treaty.expiry_tick) {
    return { ...treaty, status: 'expired' }
  }
  return treaty
}

/**
 * 格式化条约信息为 LLM 上下文
 */
export function formatTreatiesForLLM(
  orgName: string,
  treaties: Treaty[],
  allOrgs: Array<{ id: string; name: string }>,
): string {
  if (treaties.length === 0) return `${orgName} 当前没有活跃条约`

  const lines = treaties.map(t => {
    const otherParty = t.parties.find(p => p !== allOrgs.find(o => o.name === orgName)?.id)
    const otherName = allOrgs.find(o => o.id === otherParty)?.name ?? '未知'
    const status = t.status === 'active' ? '有效' : t.status === 'expired' ? '已过期' : t.status === 'violated' ? '已违反' : '已重新谈判'
    return `- ${t.type} 与 ${otherName}（${status}，强度 ${(t.strength * 100).toFixed(0)}%）`
  })

  return `${orgName} 的条约：\n${lines.join('\n')}`
}
