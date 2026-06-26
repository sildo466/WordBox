/**
 * World Fact — 世界事实库
 *
 * 记录命令产生的永久事实，影响后续演算和 LLM 上下文。
 * 事实不会消失，永久影响世界演算。
 */

export type FactCategory = 'technology' | 'political' | 'cultural' | 'military' | 'economic' | 'social' | 'environmental'

export type WorldFact = {
  id: string
  /** 事实描述（简洁明了） */
  fact: string
  /** 来自哪个神命令（可选） */
  source_command_id: string | null
  /** 发现/产生的 tick */
  discovered_at_tick: number
  /** 事实分类 */
  category: FactCategory
  /** 影响的实体 ID 列表（组织、角色、地区） */
  affected_entities: string[]
  /** 是否仍然有效（false 表示已被推翻或过时） */
  active: boolean
  /** 重要程度 0-1 */
  importance: number
  /** 附加数据（如：技术等级、政治联盟类型等） */
  metadata: Record<string, unknown>
}

export function createWorldFact(
  id: string,
  fact: string,
  category: FactCategory,
  discovered_at_tick: number,
  affected_entities: string[] = [],
  source_command_id: string | null = null,
  importance: number = 0.7,
): WorldFact {
  return {
    id,
    fact,
    source_command_id,
    discovered_at_tick,
    category,
    affected_entities,
    active: true,
    importance,
    metadata: {},
  }
}

/**
 * 从神命令生成 World Facts
 * 根据命令的意图和目标，自动推断应该产生的事实
 */
export function inferFactsFromCommand(
  command: { id: string; raw_input: string; parsed_intent: string; target_type: string; target_id: string | null; target_name: string },
  tick: number,
  orgs: Array<{ id: string; name: string }>,
  chars: Array<{ id: string; name: string }>,
  regions: Array<{ id: string; name: string }>,
): WorldFact[] {
  const facts: WorldFact[] = []
  const intent = (command.parsed_intent || command.raw_input).toLowerCase()

  // 目标实体列表：如果没有具体目标，使用所有组织（全局影响）
  const affectedEntities = command.target_id ? [command.target_id] : orgs.map(o => o.id)

  // 灭国/征服/统治类
  if (intent.includes('灭') || intent.includes('征服') || intent.includes('统治') || intent.includes('消灭') || intent.includes('毁灭') || intent.includes('conquer') || intent.includes('destroy')) {
    facts.push(createWorldFact(
      `fact_${command.id}_conquest`,
      `${command.target_name || '世界'}发动了征服战争`,
      'military',
      tick,
      affectedEntities,
      command.id,
      0.95,
    ))
  }

  // 技术研究类
  if (intent.includes('研究') || intent.includes('技术') || intent.includes('发明') || intent.includes('制造') || intent.includes('创造') || intent.includes('开发') || intent.includes('discover') || intent.includes('research') || intent.includes('technology') || intent.includes('invent') || intent.includes('create')) {
    const techName = extractTechName(command.raw_input)
    facts.push(createWorldFact(
      `fact_${command.id}_tech`,
      `${command.target_name || '世界'}掌握了${techName}技术`,
      'technology',
      tick,
      affectedEntities,
      command.id,
      0.8,
    ))
  }

  // 军事类
  if (intent.includes('战争') || intent.includes('进攻') || intent.includes('军事') || intent.includes('军队') || intent.includes('war') || intent.includes('attack') || intent.includes('military')) {
    facts.push(createWorldFact(
      `fact_${command.id}_military`,
      `${command.target_name || '世界'}发动了军事行动`,
      'military',
      tick,
      affectedEntities,
      command.id,
      0.9,
    ))
  }

  // 政治类
  if (intent.includes('联盟') || intent.includes('和平') || intent.includes('外交') || intent.includes('alliance') || intent.includes('peace') || intent.includes('diplomacy')) {
    facts.push(createWorldFact(
      `fact_${command.id}_political`,
      `${command.target_name || '世界'}进行了政治变革`,
      'political',
      tick,
      affectedEntities,
      command.id,
      0.7,
    ))
  }

  // 经济类
  if (intent.includes('贸易') || intent.includes('经济') || intent.includes('资源') || intent.includes('trade') || intent.includes('economic')) {
    facts.push(createWorldFact(
      `fact_${command.id}_economic`,
      `${command.target_name || '世界'}的经济格局发生变化`,
      'economic',
      tick,
      affectedEntities,
      command.id,
      0.6,
    ))
  }

  // 文化类
  if (intent.includes('文化') || intent.includes('宗教') || intent.includes('信仰') || intent.includes('culture') || intent.includes('religion')) {
    facts.push(createWorldFact(
      `fact_${command.id}_cultural`,
      `${command.target_name || '世界'}的文化发生变革`,
      'cultural',
      tick,
      affectedEntities,
      command.id,
      0.6,
    ))
  }

  // 社会类
  if (intent.includes('人口') || intent.includes('移民') || intent.includes('社会') || intent.includes('population') || intent.includes('migration')) {
    facts.push(createWorldFact(
      `fact_${command.id}_social`,
      `${command.target_name || '世界'}的社会结构发生变化`,
      'social',
      tick,
      affectedEntities,
      command.id,
      0.5,
    ))
  }

  // 环境类
  if (intent.includes('环境') || intent.includes('气候') || intent.includes('灾难') || intent.includes('environment') || intent.includes('climate') || intent.includes('disaster')) {
    facts.push(createWorldFact(
      `fact_${command.id}_environmental`,
      `${command.target_name || '世界'}的环境发生变化`,
      'environmental',
      tick,
      affectedEntities,
      command.id,
      0.7,
    ))
  }

  // 如果没有匹配到特定类别，创建一个通用事实
  if (facts.length === 0) {
    facts.push(createWorldFact(
      `fact_${command.id}_general`,
      `神令「${command.raw_input.slice(0, 30)}」改变了世界`,
      'political',
      tick,
      command.target_id ? [command.target_id] : [],
      command.id,
      0.5,
    ))
  }

  return facts
}

function extractTechName(rawInput: string): string {
  // 尝试从输入中提取技术名称
  const techPatterns = [
    /研究(.+?)技术/,
    /发明(.+)/,
    /开发(.+)/,
    /research (.+)/i,
    /discover (.+)/i,
    /develop (.+)/i,
  ]

  for (const pattern of techPatterns) {
    const match = rawInput.match(pattern)
    if (match) return match[1].trim()
  }

  return '新'
}

/**
 * 将 World Facts 格式化为 LLM 可读的上下文
 */
export function formatFactsForLLM(facts: WorldFact[]): string {
  if (facts.length === 0) return ''

  const activeFacts = facts.filter(f => f.active)
  if (activeFacts.length === 0) return ''

  const byCategory: Record<string, WorldFact[]> = {}
  for (const fact of activeFacts) {
    if (!byCategory[fact.category]) byCategory[fact.category] = []
    byCategory[fact.category].push(fact)
  }

  const categoryNames: Record<string, string> = {
    technology: '技术',
    political: '政治',
    cultural: '文化',
    military: '军事',
    economic: '经济',
    social: '社会',
    environmental: '环境',
  }

  const lines: string[] = []
  for (const [category, categoryFacts] of Object.entries(byCategory)) {
    const categoryName = categoryNames[category] ?? category
    lines.push(`### ${categoryName}事实`)
    for (const fact of categoryFacts.sort((a, b) => b.importance - a.importance).slice(0, 5)) {
      lines.push(`- ${fact.fact}（发现于 Tick ${fact.discovered_at_tick}）`)
    }
  }

  return lines.join('\n')
}
