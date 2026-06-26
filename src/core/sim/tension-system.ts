/**
 * 组织紧张度系统
 *
 * 5 种紧张度类型，每种有独立的生命周期：
 * brewing → rising → critical → erupting → resolving → resolved
 */

// ─── 类型定义 ───

export type TensionType = 'territorial' | 'economic' | 'ideological' | 'succession' | 'diplomatic'

export type TensionStage = 'brewing' | 'rising' | 'critical' | 'erupting' | 'resolving' | 'resolved'

export type OrgTension = {
  id: string
  type: TensionType
  stage: TensionStage
  intensity: number           // [0, 100]
  source_org_id: string
  target_org_id: string
  cause: string
  started_tick: number
  peak_tick: number | null
  resolved_tick: number | null
  decay_rate: number          // 每 tick 衰减量
  build_rate: number          // 每 tick 增长量
  eruption_threshold: number  // 爆发阈值
}

// ─── 常量 ───

const TENSION_CONFIG: Record<TensionType, {
  build_rate_base: number
  decay_rate_base: number
  eruption_threshold: number
  peak_hold_ticks: number
  resolve_ticks: number
}> = {
  territorial: { build_rate_base: 2.5, decay_rate_base: 0.8, eruption_threshold: 85, peak_hold_ticks: 3, resolve_ticks: 8 },
  economic:    { build_rate_base: 1.8, decay_rate_base: 1.0, eruption_threshold: 80, peak_hold_ticks: 2, resolve_ticks: 6 },
  ideological: { build_rate_base: 1.2, decay_rate_base: 0.5, eruption_threshold: 90, peak_hold_ticks: 5, resolve_ticks: 12 },
  succession:  { build_rate_base: 3.0, decay_rate_base: 0.6, eruption_threshold: 75, peak_hold_ticks: 2, resolve_ticks: 5 },
  diplomatic:  { build_rate_base: 1.5, decay_rate_base: 1.2, eruption_threshold: 80, peak_hold_ticks: 2, resolve_ticks: 5 },
}

// ─── 创建 ───

/**
 * 创建新紧张度
 */
export function createTension(
  id: string,
  type: TensionType,
  sourceOrgId: string,
  targetOrgId: string,
  cause: string,
  currentTick: number,
  initialIntensity: number = 20,
): OrgTension {
  const config = TENSION_CONFIG[type]
  return {
    id,
    type,
    stage: 'brewing',
    intensity: Math.max(0, Math.min(100, initialIntensity)),
    source_org_id: sourceOrgId,
    target_org_id: targetOrgId,
    cause,
    started_tick: currentTick,
    peak_tick: null,
    resolved_tick: null,
    decay_rate: config.decay_rate_base,
    build_rate: config.build_rate_base,
    eruption_threshold: config.eruption_threshold,
  }
}

// ─── 紧张度生成触发器 ───

/**
 * 检查是否应生成新的紧张度
 */
export function checkTensionTriggers(
  orgs: Array<{
    id: string
    territory: string[]
    relations: Array<{ organization_id: string; type: string; strength: number }>
    ideology?: string
  }>,
  existingTensions: OrgTension[],
  currentTick: number,
): OrgTension[] {
  const newTensions: OrgTension[] = []

  for (const org of orgs) {
    for (const other of orgs) {
      if (org.id === other.id) continue

      // 检查是否已有该对之间的紧张度
      const existing = existingTensions.find(t =>
        (t.source_org_id === org.id && t.target_org_id === other.id) ||
        (t.source_org_id === other.id && t.target_org_id === org.id)
      )
      if (existing && existing.stage !== 'resolved') continue

      const rel = (org.relations ?? []).find(r => r.organization_id === other.id)
      if (!rel) continue

      // 领土争端
      if (rel.type === 'enemy' && hasTerritorialOverlap(org.territory, other.territory)) {
        newTensions.push(createTension(
          `tension_territorial_${org.id}_${other.id}_${currentTick}`,
          'territorial', org.id, other.id,
          '领土争端',
          currentTick, 30,
        ))
      }

      // 经济紧张 — 贸易伙伴但关系恶化
      if (rel.type === 'trading_partner' && rel.strength < -10) {
        newTensions.push(createTension(
          `tension_economic_${org.id}_${other.id}_${currentTick}`,
          'economic', org.id, other.id,
          '贸易摩擦',
          currentTick, 20,
        ))
      }

      // 意识形态冲突
      if (org.ideology && other.ideology && org.ideology !== other.ideology && rel.type === 'enemy') {
        newTensions.push(createTension(
          `tension_ideological_${org.id}_${other.id}_${currentTick}`,
          'ideological', org.id, other.id,
          '意识形态对立',
          currentTick, 25,
        ))
      }

      // 外交紧张 — 关系极差
      if (rel.strength < -30 && rel.type !== 'ally') {
        newTensions.push(createTension(
          `tension_diplomatic_${org.id}_${other.id}_${currentTick}`,
          'diplomatic', org.id, other.id,
          '外交关系恶化',
          currentTick, 15,
        ))
      }
    }
  }

  return newTensions
}

// ─── 紧张度演算 ───

/**
 * 每 tick 更新所有紧张度
 */
export function evolveTensions(
  tensions: OrgTension[],
  currentTick: number,
  externalPressure: number = 0, // 外部事件施加的压力
): { tensions: OrgTension[]; eruptions: OrgTension[] } {
  const eruptions: OrgTension[] = []

  for (const tension of tensions) {
    if (tension.stage === 'resolved') continue

    switch (tension.stage) {
      case 'brewing': {
        tension.intensity = Math.min(100, tension.intensity + tension.build_rate + externalPressure * 0.1)
        if (tension.intensity > 30) {
          tension.stage = 'rising'
        }
        // 自然消退（如果压力不够）
        if (tension.intensity < 5 && currentTick - tension.started_tick > 10) {
          tension.stage = 'resolved'
          tension.resolved_tick = currentTick
        }
        break
      }

      case 'rising': {
        tension.intensity = Math.min(100, tension.intensity + tension.build_rate * 0.8 + externalPressure * 0.15)
        if (tension.intensity >= tension.eruption_threshold * 0.7) {
          tension.stage = 'critical'
        }
        // 外部调解可以减缓上升
        if (externalPressure < -0.5) {
          tension.intensity = Math.max(0, tension.intensity + externalPressure * 0.3)
        }
        break
      }

      case 'critical': {
        tension.intensity = Math.min(100, tension.intensity + tension.build_rate * 0.5)
        if (tension.intensity >= tension.eruption_threshold) {
          tension.stage = 'erupting'
          tension.peak_tick = currentTick
          eruptions.push(tension)
        }
        break
      }

      case 'erupting': {
        // 爆发后保持高强度若干 tick
        const ticksSincePeak = currentTick - (tension.peak_tick ?? currentTick)
        if (ticksSincePeak >= TENSION_CONFIG[tension.type].peak_hold_ticks) {
          tension.stage = 'resolving'
        }
        // 爆发期间仍可能有事件
        eruptions.push(tension)
        break
      }

      case 'resolving': {
        tension.intensity = Math.max(0, tension.intensity - tension.decay_rate * 1.5)
        if (tension.intensity < 10) {
          tension.stage = 'resolved'
          tension.resolved_tick = currentTick
        }
        break
      }
    }
  }

  return { tensions, eruptions }
}

// ─── 紧张度影响 ───

/**
 * 紧张度对组织指标的影响
 */
export function calcTensionImpact(tension: OrgTension): {
  cohesion_delta: number
  reputation_delta: number
  military_delta: number
} {
  const intensityFactor = tension.intensity / 100

  switch (tension.stage) {
    case 'erupting':
      return {
        cohesion_delta: -5 * intensityFactor,
        reputation_delta: -3 * intensityFactor,
        military_delta: 2, // 紧张时期军力上升（备战）
      }
    case 'critical':
      return {
        cohesion_delta: -2 * intensityFactor,
        reputation_delta: -1 * intensityFactor,
        military_delta: 1,
      }
    case 'rising':
      return {
        cohesion_delta: -1 * intensityFactor,
        reputation_delta: 0,
        military_delta: 0.5,
      }
    default:
      return { cohesion_delta: 0, reputation_delta: 0, military_delta: 0 }
  }
}

// ─── 辅助函数 ───

function hasTerritorialOverlap(territory1: string[], territory2: string[]): boolean {
  const set1 = new Set(territory1)
  return territory2.some(t => set1.has(t))
}

/**
 * 格式化紧张度为 LLM 上下文
 */
export function formatTensionsForLLM(
  tensions: OrgTension[],
  allOrgs: Array<{ id: string; name: string }>,
): string {
  const active = tensions.filter(t => t.stage !== 'resolved')
  if (active.length === 0) return '当前世界局势平稳'

  const stageNames: Record<TensionStage, string> = {
    brewing: '酝酿中',
    rising: '升级中',
    critical: '临界状态',
    erupting: '已爆发',
    resolving: '缓和中',
    resolved: '已解决',
  }

  const lines = active.map(t => {
    const sourceName = allOrgs.find(o => o.id === t.source_org_id)?.name ?? '未知'
    const targetName = allOrgs.find(o => o.id === t.target_org_id)?.name ?? '未知'
    return `- ${t.type}紧张：${sourceName} vs ${targetName}（${stageNames[t.stage]}，强度 ${t.intensity.toFixed(0)}）— ${t.cause}`
  })

  return `世界紧张局势：\n${lines.join('\n')}`
}

/**
 * 获取世界整体紧张度评分 [0, 100]
 */
export function calcGlobalTension(tensions: OrgTension[]): number {
  const active = tensions.filter(t => t.stage !== 'resolved')
  if (active.length === 0) return 0

  const totalIntensity = active.reduce((sum, t) => sum + t.intensity, 0)
  return Math.min(100, totalIntensity / Math.max(1, active.length) * (1 + active.length * 0.1))
}
