/**
 * Entity Memory — 跨 Tick 实体记忆系统
 *
 * 为每个组织和角色维护一个"事件记忆"数组，按重要度排序，保留最近 N 条。
 * LLM prompt 中注入该实体的记忆，让 LLM 能引用历史事件。
 */

export type MemoryEntry = {
  tick: number
  event_type: string
  summary: string
  impact: number  // 对该实体的影响程度 0-1
  related_entity_ids: string[]  // 相关的其他实体
}

export type EntityMemory = {
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  entries: MemoryEntry[]
  max_size: number
}

export function createEntityMemory(
  entity_id: string,
  entity_type: 'organization' | 'character' | 'region',
  max_size: number = 20,
): EntityMemory {
  return {
    entity_id,
    entity_type,
    entries: [],
    max_size,
  }
}

/**
 * 向实体记忆中添加一条记忆
 * 如果超过最大容量，删除最旧且影响最小的记忆
 */
export function addMemoryEntry(
  memory: EntityMemory,
  entry: MemoryEntry,
): void {
  memory.entries.push(entry)

  // 按重要度排序（高在前），同重要度按 tick 排序（新在前）
  memory.entries.sort((a, b) => {
    if (b.impact !== a.impact) return b.impact - a.impact
    return b.tick - a.tick
  })

  // 超过容量时删除最不重要的
  if (memory.entries.length > memory.max_size) {
    memory.entries = memory.entries.slice(0, memory.max_size)
  }
}

/**
 * 从事件中提取记忆条目
 */
export function extractMemoryFromEvent(
  event: {
    id: string
    type: string
    title: string
    summary: string
    importance: number
    actor_ids: string[]
    target_ids: string[]
    tick: number
  },
  entityId: string,
): MemoryEntry {
  // 计算该事件对此实体的影响程度
  const isActor = event.actor_ids?.includes(entityId) ?? false
  const isTarget = event.target_ids?.includes(entityId) ?? false

  let impact = event.importance
  if (isActor) impact = Math.min(1, impact * 1.2)
  if (isTarget) impact = Math.min(1, impact * 1.1)

  return {
    tick: event.tick,
    event_type: event.type,
    summary: event.summary || event.title,
    impact,
    related_entity_ids: [
      ...(event.actor_ids ?? []),
      ...(event.target_ids ?? []),
    ].filter(id => id !== entityId),
  }
}

/**
 * 获取实体的最近 N 条重要记忆（用于 LLM prompt）
 */
export function getRecentMemories(
  memory: EntityMemory,
  count: number = 10,
): MemoryEntry[] {
  return memory.entries
    .slice()
    .sort((a, b) => b.tick - a.tick)
    .slice(0, count)
}

/**
 * 将实体记忆格式化为 LLM 可读的上下文
 */
export function formatMemoryForLLM(
  entityName: string,
  memory: EntityMemory,
  count: number = 10,
): string {
  const recent = getRecentMemories(memory, count)
  if (recent.length === 0) return ''

  const lines: string[] = [`### ${entityName}的记忆`]
  for (const entry of recent) {
    lines.push(`- Tick ${entry.tick} [${entry.event_type}] ${entry.summary}`)
  }
  return lines.join('\n')
}

/**
 * 从世界状态中获取或创建实体记忆
 */
export function getOrCreateMemory(
  memories: Map<string, EntityMemory>,
  entityId: string,
  entityType: 'organization' | 'character' | 'region',
): EntityMemory {
  const key = `${entityType}:${entityId}`
  if (!memories.has(key)) {
    memories.set(key, createEntityMemory(entityId, entityType))
  }
  return memories.get(key)!
}

/**
 * 批量更新所有实体的记忆
 */
export function updateMemoriesFromEvents(
  memories: Map<string, EntityMemory>,
  events: Array<{
    id: string
    type: string
    title: string
    summary: string
    importance: number
    actor_ids: string[]
    target_ids: string[]
    tick: number
  }>,
): void {
  for (const event of events) {
    // 更新 actor 的记忆
    for (const actorId of event.actor_ids ?? []) {
      const memory = getOrCreateMemory(memories, actorId, 'character')
      addMemoryEntry(memory, extractMemoryFromEvent(event, actorId))
    }

    // 更新 target 的记忆
    for (const targetId of event.target_ids ?? []) {
      const memory = getOrCreateMemory(memories, targetId, 'organization')
      addMemoryEntry(memory, extractMemoryFromEvent(event, targetId))
    }
  }
}
