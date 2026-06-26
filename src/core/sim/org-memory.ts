/**
 * 组织层级记忆系统
 *
 * 三层记忆结构：
 * - 工作记忆：当前 tick 的即时信息，容量 7，3 tick 后过期
 * - 短期记忆：近期事件，容量 50，按重要性×情感权重排序
 * - 长期记忆：历史里程碑，无容量上限，缓慢衰减
 *
 * 集体规范：从反复出现的记忆模式中提取，影响组织行为
 */

// ─── 类型定义 ───

export type OrgMemoryEntry = {
  id: string
  content: string
  importance: number        // [0, 1]
  emotional_weight: number  // [0, 1] — 正面=积极，负面=消极
  source: 'self' | 'diplomacy' | 'world' | 'command' | 'conflict'
  event_type: string        // 原始事件类型
  related_entity_ids: string[]  // 相关实体 ID
  tick: number              // 记录时的 tick
  decay_rate: number        // 衰减速率（工作记忆 > 短期 > 长期）
  retrieval_strength: number // 检索强度（被检索时增加）
}

export type OrgNorm = {
  id: string
  description: string
  category: 'diplomatic' | 'military' | 'economic' | 'cultural' | 'governance'
  strength: number          // [0, 1] — 规范强度
  formed_tick: number
  source_memory_ids: string[] // 形成该规范的记忆
  adherents: string[]       // 遵守该规范的组织 ID
  violators: string[]       // 违反该规范的组织 ID
}

export type OrgMemoryStore = {
  working: OrgMemoryEntry[]     // 容量 7，3 tick 过期
  short_term: OrgMemoryEntry[]  // 容量 50
  long_term: OrgMemoryEntry[]   // 无容量上限
  norms: OrgNorm[]              // 集体规范
  last_access_tick: number      // 最后访问 tick
}

// ─── 常量 ───

const WORKING_CAPACITY = 7
const WORKING_EXPIRY_TICKS = 3
const SHORT_TERM_CAPACITY = 50
const LONG_TERM_DECAY_RATE = 0.005
const SHORT_TERM_DECAY_RATE = 0.02
const WORKING_DECAY_RATE = 0.1
const CONSOLIDATION_THRESHOLD = 0.6  // 短期→长期的晋升阈值
const NORM_FORMATION_MIN_MEMORIES = 3 // 形成规范最少需要的记忆数
const NORM_SIMILARITY_THRESHOLD = 0.7 // 记忆相似度阈值
const RETRIEVAL_BOOST = 0.05          // 检索时的强度提升

// ─── 创建 ───

export function createOrgMemoryStore(): OrgMemoryStore {
  return {
    working: [],
    short_term: [],
    long_term: [],
    norms: [],
    last_access_tick: 0,
  }
}

// ─── 写入 ───

/**
 * 记录一条新记忆到组织记忆库
 */
export function recordOrgMemory(
  store: OrgMemoryStore,
  entry: Omit<OrgMemoryEntry, 'decay_rate' | 'retrieval_strength'>,
  currentTick: number,
): void {
  const fullEntry: OrgMemoryEntry = {
    ...entry,
    decay_rate: WORKING_DECAY_RATE,
    retrieval_strength: entry.importance,
  }

  // 先进工作记忆
  store.working.push(fullEntry)

  // 工作记忆溢出 → 晋升到短期记忆（按重要性淘汰最弱的）
  if (store.working.length > WORKING_CAPACITY) {
    store.working.sort((a, b) => {
      const scoreA = a.importance * a.retrieval_strength
      const scoreB = b.importance * b.retrieval_strength
      return scoreB - scoreA
    })
    const evicted = store.working.pop()!
    evicted.decay_rate = SHORT_TERM_DECAY_RATE
    store.short_term.push(evicted)
  }

  // 短期记忆溢出 → 淘汰最弱的（不晋升长期，除非达到巩固阈值）
  if (store.short_term.length > SHORT_TERM_CAPACITY) {
    store.short_term.sort((a, b) => {
      const scoreA = a.importance * a.retrieval_strength
      const scoreB = b.importance * b.retrieval_strength
      return scoreB - scoreA
    })
    const weakest = store.short_term.pop()!
    // 如果足够重要，晋升长期记忆
    if (weakest.importance * weakest.retrieval_strength >= CONSOLIDATION_THRESHOLD) {
      weakest.decay_rate = LONG_TERM_DECAY_RATE
      store.long_term.push(weakest)
    }
    // 否则丢弃（遗忘）
  }

  store.last_access_tick = currentTick
}

// ─── 衰减 ───

/**
 * 每 tick 调用：衰减所有记忆，过期的工作记忆晋升或丢弃
 */
export function decayOrgMemory(store: OrgMemoryStore, currentTick: number): void {
  // 工作记忆：按 tick 过期
  store.working = store.working.filter(entry => {
    const age = currentTick - entry.tick
    if (age >= WORKING_EXPIRY_TICKS) {
      // 晋升到短期记忆
      entry.decay_rate = SHORT_TERM_DECAY_RATE
      store.short_term.push(entry)
      return false
    }
    // 检索强度衰减
    entry.retrieval_strength = Math.max(0, entry.retrieval_strength - entry.decay_rate)
    return true
  })

  // 短期记忆：衰减，强度归零则丢弃或晋升
  store.short_term = store.short_term.filter(entry => {
    entry.retrieval_strength = Math.max(0, entry.retrieval_strength - entry.decay_rate)
    if (entry.retrieval_strength <= 0.01) {
      // 巩固检查：重要记忆晋升长期
      if (entry.importance >= CONSOLIDATION_THRESHOLD) {
        entry.decay_rate = LONG_TERM_DECAY_RATE
        entry.retrieval_strength = entry.importance * 0.5 // 重置为重要性的一半
        store.long_term.push(entry)
      }
      return false // 从短期移除
    }
    return true
  })

  // 短期记忆溢出处理
  if (store.short_term.length > SHORT_TERM_CAPACITY) {
    store.short_term.sort((a, b) => {
      const scoreA = a.importance * a.retrieval_strength
      const scoreB = b.importance * b.retrieval_strength
      return scoreB - scoreA
    })
    const evicted = store.short_term.splice(SHORT_TERM_CAPACITY)
    for (const entry of evicted) {
      if (entry.importance >= CONSOLIDATION_THRESHOLD) {
        entry.decay_rate = LONG_TERM_DECAY_RATE
        store.long_term.push(entry)
      }
    }
  }

  // 长期记忆：缓慢衰减（永不丢弃，但检索强度可以很低）
  for (const entry of store.long_term) {
    entry.retrieval_strength = Math.max(0.01, entry.retrieval_strength - entry.decay_rate)
  }

  // 集体规范衰减
  store.norms = store.norms.filter(norm => {
    norm.strength = Math.max(0, norm.strength - 0.002)
    return norm.strength > 0.01
  })

  store.last_access_tick = currentTick
}

// ─── 检索 ───

export type MemoryQuery = {
  keyword?: string
  event_type?: string
  related_entity_id?: string
  source?: OrgMemoryEntry['source']
  min_importance?: number
  max_age_ticks?: number
  limit?: number
}

/**
 * 检索记忆 — 搜索所有三层，按相关性排序
 */
export function queryOrgMemory(
  store: OrgMemoryStore,
  query: MemoryQuery,
  currentTick: number,
): OrgMemoryEntry[] {
  const allEntries = [
    ...store.working.map(e => ({ ...e, _layer: 'working' as const, _layerWeight: 1.5 })),
    ...store.short_term.map(e => ({ ...e, _layer: 'short_term' as const, _layerWeight: 1.0 })),
    ...store.long_term.map(e => ({ ...e, _layer: 'long_term' as const, _layerWeight: 0.8 })),
  ]

  const results = allEntries
    .filter(entry => {
      if (query.keyword && !entry.content.includes(query.keyword)) return false
      if (query.event_type && entry.event_type !== query.event_type) return false
      if (query.related_entity_id && !entry.related_entity_ids.includes(query.related_entity_id)) return false
      if (query.source && entry.source !== query.source) return false
      if (query.min_importance != null && entry.importance < query.min_importance) return false
      if (query.max_age_ticks != null && (currentTick - entry.tick) > query.max_age_ticks) return false
      return true
    })
    .map(entry => {
      // 综合得分 = 重要性 × 检索强度 × 层级权重 × 时间衰减
      const age = currentTick - entry.tick
      const timeDecay = Math.max(0.1, 1 - age * 0.01)
      const score = entry.importance * entry.retrieval_strength * entry._layerWeight * timeDecay

      // 检索时增强检索强度
      entry.retrieval_strength = Math.min(1, entry.retrieval_strength + RETRIEVAL_BOOST)

      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)
    .map(r => r.entry)

  return results.slice(0, query.limit ?? 10)
}

// ─── 集体规范 ───

/**
 * 从短期记忆中检测反复出现的模式，形成集体规范
 */
export function detectNorms(store: OrgMemoryStore, currentTick: number): void {
  // 对短期记忆按事件类型分组
  const byType = new Map<string, OrgMemoryEntry[]>()
  for (const entry of store.short_term) {
    const group = byType.get(entry.event_type) ?? []
    group.push(entry)
    byType.set(entry.event_type, group)
  }

  for (const [eventType, entries] of byType) {
    if (entries.length < NORM_FORMATION_MIN_MEMORIES) continue

    // 检查是否已存在该类型的规范
    const existingNorm = store.norms.find(n => n.category === mapEventTypeToNormCategory(eventType))
    if (existingNorm) {
      // 强化现有规范
      existingNorm.strength = Math.min(1, existingNorm.strength + 0.05)
      continue
    }

    // 计算平均重要性和情感倾向
    const avgImportance = entries.reduce((s, e) => s + e.importance, 0) / entries.length
    const avgEmotion = entries.reduce((s, e) => s + e.emotional_weight, 0) / entries.length

    if (avgImportance >= 0.4) {
      store.norms.push({
        id: `norm_${eventType}_${currentTick}`,
        description: generateNormDescription(eventType, avgEmotion),
        category: mapEventTypeToNormCategory(eventType),
        strength: Math.min(0.5, avgImportance),
        formed_tick: currentTick,
        source_memory_ids: entries.map(e => e.id),
        adherents: [],
        violators: [],
      })
    }
  }
}

function mapEventTypeToNormCategory(eventType: string): OrgNorm['category'] {
  if (['battle', 'rebellion', 'assassination'].includes(eventType)) return 'military'
  if (['trade', 'economic_growth', 'economic_decline'].includes(eventType)) return 'economic'
  if (['alliance', 'negotiation'].includes(eventType)) return 'diplomatic'
  if (['ritual', 'discovery', 'cultural_exchange'].includes(eventType)) return 'cultural'
  return 'governance'
}

function generateNormDescription(eventType: string, avgEmotion: number): string {
  const sentiment = avgEmotion > 0 ? '倾向于' : '警惕于'
  const typeNames: Record<string, string> = {
    battle: '军事冲突',
    trade: '贸易往来',
    alliance: '结盟',
    betrayal: '背叛',
    rebellion: '叛乱',
    negotiation: '谈判',
    discovery: '探索发现',
    ritual: '仪式庆典',
  }
  const name = typeNames[eventType] ?? eventType
  return `组织${sentiment}${name}`
}

// ─── LLM 上下文格式化 ───

/**
 * 将组织记忆格式化为 LLM 可读的上下文字符串
 */
export function formatOrgMemoryForLLM(
  orgName: string,
  store: OrgMemoryStore,
  currentTick: number,
  maxEntries: number = 8,
): string {
  const lines: string[] = [`### ${orgName} 的记忆`]

  // 工作记忆（当前感知）
  if (store.working.length > 0) {
    lines.push('**当前感知：**')
    for (const entry of store.working.slice(0, 3)) {
      lines.push(`- [tick ${entry.tick}] ${entry.content}`)
    }
  }

  // 短期记忆（近期重要事件）
  const recentShort = store.short_term
    .sort((a, b) => b.importance * b.retrieval_strength - a.importance * a.retrieval_strength)
    .slice(0, 5)
  if (recentShort.length > 0) {
    lines.push('**近期记忆：**')
    for (const entry of recentShort) {
      const age = currentTick - entry.tick
      lines.push(`- [${age}tick前] ${entry.content}`)
    }
  }

  // 长期记忆（历史里程碑）
  const topLong = store.long_term
    .sort((a, b) => b.importance * b.retrieval_strength - a.importance * a.retrieval_strength)
    .slice(0, 3)
  if (topLong.length > 0) {
    lines.push('**历史里程碑：**')
    for (const entry of topLong) {
      lines.push(`- [tick ${entry.tick}] ${entry.content}`)
    }
  }

  // 集体规范
  if (store.norms.length > 0) {
    lines.push('**组织规范：**')
    for (const norm of store.norms.slice(0, 3)) {
      lines.push(`- ${norm.description}（强度：${(norm.strength * 100).toFixed(0)}%）`)
    }
  }

  return lines.join('\n')
}

// ─── 序列化 ───

export function serializeOrgMemory(store: OrgMemoryStore): Record<string, unknown> {
  return {
    working: store.working,
    short_term: store.short_term,
    long_term: store.long_term,
    norms: store.norms,
    last_access_tick: store.last_access_tick,
  }
}

export function deserializeOrgMemory(data: Record<string, unknown>): OrgMemoryStore {
  return {
    working: Array.isArray(data.working) ? data.working : [],
    short_term: Array.isArray(data.short_term) ? data.short_term : [],
    long_term: Array.isArray(data.long_term) ? data.long_term : [],
    norms: Array.isArray(data.norms) ? data.norms : [],
    last_access_tick: typeof data.last_access_tick === 'number' ? data.last_access_tick : 0,
  }
}
