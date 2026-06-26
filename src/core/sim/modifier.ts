/**
 * ActiveModifier — 命令持续效果系统
 *
 * 命令不再是一次性完成，而是作为"modifier"持续 N 个 tick。
 * 数学引擎每 tick 自动应用所有 active modifiers。
 */

export type ModifierTargetType = 'organization' | 'character' | 'region' | 'world'

export type ActiveModifier = {
  id: string
  /** 来源命令 ID */
  source_command_id: string
  /** 目标实体 ID */
  target_id: string
  /** 目标类型 */
  target_type: ModifierTargetType
  /** 影响的字段 */
  field: string
  /** 每 tick 的变化量 */
  delta_per_tick: number
  /** 剩余 tick 数 */
  remaining_ticks: number
  /** 描述 */
  description: string
  /** 创建于哪个 tick */
  created_at_tick: number
}

export function createActiveModifier(
  id: string,
  source_command_id: string,
  target_id: string,
  target_type: ModifierTargetType,
  field: string,
  delta_per_tick: number,
  duration_ticks: number,
  description: string,
  created_at_tick: number,
): ActiveModifier {
  return {
    id,
    source_command_id,
    target_id,
    target_type,
    field,
    delta_per_tick,
    remaining_ticks: duration_ticks,
    description,
    created_at_tick,
  }
}

/**
 * 从神命令生成 ActiveModifiers
 * 根据命令的意图和强度，决定影响的字段、每 tick 变化量和持续时间
 */
export function inferModifiersFromCommand(
  command: {
    id: string
    raw_input: string
    parsed_intent: string
    target_type: string
    target_id: string | null
    target_name: string
    strength: string
    estimated_ticks: number
    narrative_plan?: string[]
  },
  tick: number,
): ActiveModifier[] {
  const modifiers: ActiveModifier[] = []
  const intent = (command.parsed_intent || command.raw_input).toLowerCase()
  const strengthMultiplier = command.strength === 'divine_decree' ? 1.5 : command.strength === 'order' ? 1.0 : 0.6

  // 持续时间：基于叙事计划长度，每阶段约 4 tick
  const planLength = command.narrative_plan?.length ?? 0
  const baseDuration = planLength > 0
    ? planLength * 4
    : command.strength === 'divine_decree' ? 20 : command.strength === 'order' ? 15 : 10
  const duration = Math.max(5, Math.min(50, command.estimated_ticks || baseDuration))

  // 目标 ID：如果没有解析到具体目标，使用 'world' 作为全局 modifier
  const targetId = command.target_id || 'world'
  const targetType = (command.target_id ? command.target_type : 'world') as ModifierTargetType

  // 灭国/征服/统治类（优先级最高，因为包含"研究"也可能匹配技术类）
  if (intent.includes('灭') || intent.includes('征服') || intent.includes('统治') || intent.includes('消灭') || intent.includes('毁灭') || intent.includes('conquer') || intent.includes('destroy')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_mil`,
      command.id,
      targetId,
      targetType,
      'military_strength',
      1.0 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强军事力量`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_cohesion`,
      command.id,
      targetId,
      targetType,
      'cohesion',
      0.3 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」增强凝聚力`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_inf`,
      command.id,
      targetId,
      targetType,
      'influence_score',
      0.5 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」提升影响力`,
      tick,
    ))
  }

  // 技术研究类（包含"研究"、"发明"、"制造"、"创造"等）
  else if (intent.includes('研究') || intent.includes('技术') || intent.includes('发明') || intent.includes('制造') || intent.includes('创造') || intent.includes('开发') || intent.includes('research') || intent.includes('technology') || intent.includes('invent') || intent.includes('create') || intent.includes('develop')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_mil`,
      command.id,
      targetId,
      targetType,
      'military_strength',
      0.5 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强军事力量`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_econ`,
      command.id,
      targetId,
      targetType,
      'economic_power',
      0.3 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强经济实力`,
      tick,
    ))
  }

  // 军事类
  else if (intent.includes('战争') || intent.includes('进攻') || intent.includes('军事') || intent.includes('军队') || intent.includes('war') || intent.includes('attack') || intent.includes('military')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_mil`,
      command.id,
      targetId,
      targetType,
      'military_strength',
      0.8 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强军事力量`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_cohesion`,
      command.id,
      targetId,
      targetType,
      'cohesion',
      -0.3 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」导致凝聚力下降`,
      tick,
    ))
  }

  // 经济类
  else if (intent.includes('贸易') || intent.includes('经济') || intent.includes('资源') || intent.includes('trade') || intent.includes('economic')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_econ`,
      command.id,
      targetId,
      targetType,
      'economic_power',
      0.6 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强经济实力`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_res`,
      command.id,
      targetId,
      targetType,
      'resources',
      0.4 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增加资源`,
      tick,
    ))
  }

  // 政治/外交类
  else if (intent.includes('联盟') || intent.includes('和平') || intent.includes('外交') || intent.includes('alliance') || intent.includes('peace')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_rep`,
      command.id,
      targetId,
      targetType,
      'public_reputation',
      0.3 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续提升声望`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_cohesion`,
      command.id,
      targetId,
      targetType,
      'cohesion',
      0.2 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强凝聚力`,
      tick,
    ))
  }

  // 文化/宗教类
  else if (intent.includes('文化') || intent.includes('宗教') || intent.includes('信仰') || intent.includes('culture') || intent.includes('religion')) {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_cohesion`,
      command.id,
      targetId,
      targetType,
      'cohesion',
      0.4 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续增强凝聚力`,
      tick,
    ))
    modifiers.push(createActiveModifier(
      `mod_${command.id}_inf`,
      command.id,
      targetId,
      targetType,
      'influence_score',
      0.2 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续提升影响力`,
      tick,
    ))
  }

  // 默认：影响力提升
  else {
    modifiers.push(createActiveModifier(
      `mod_${command.id}_inf`,
      command.id,
      targetId,
      targetType,
      'influence_score',
      0.3 * strengthMultiplier,
      duration,
      `神令「${command.raw_input.slice(0, 20)}」持续生效`,
      tick,
    ))
  }

  return modifiers
}

/**
 * 清理过期的 modifiers
 */
export function cleanupModifiers(modifiers: ActiveModifier[]): ActiveModifier[] {
  return modifiers.filter(m => m.remaining_ticks > 0)
}

/**
 * 将 active modifiers 格式化为 LLM 可读的上下文
 */
export function formatModifiersForLLM(modifiers: ActiveModifier[]): string {
  if (modifiers.length === 0) return ''

  const lines: string[] = ['## 正在生效的神令效果']
  for (const mod of modifiers) {
    const direction = mod.delta_per_tick > 0 ? '+' : ''
    lines.push(`- ${mod.description}（${mod.field} ${direction}${mod.delta_per_tick}/tick，剩余 ${mod.remaining_ticks} tick）`)
  }
  return lines.join('\n')
}
