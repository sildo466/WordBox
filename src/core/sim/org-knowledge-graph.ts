/**
 * 组织知识图谱
 *
 * 节点类型：组织、地区、人物、事件、概念、条约
 * 边类型：控制、敌对、同盟、贸易、引发、参与、知晓
 *
 * 支持因果链追溯和最短路径查询
 */

// ─── 类型定义 ───

export type KGNodeType = 'organization' | 'region' | 'character' | 'event' | 'concept' | 'treaty'

export type KGEdgeType =
  | 'controls'        // 组织 → 地区
  | 'hostile'         // 组织 ↔ 组织
  | 'allied'          // 组织 ↔ 组织
  | 'trades_with'     // 组织 ↔ 组织
  | 'caused_by'       // 事件 → 事件
  | 'participates_in' // 实体 → 事件
  | 'located_in'      // 实体 → 地区
  | 'knows'           // 组织 → 事件（知晓）
  | 'member_of'       // 人物 → 组织
  | 'rules'           // 人物 → 组织
  | 'signs'           // 组织 → 条约
  | 'affects'         // 事件 → 实体

export type KGNode = {
  id: string
  type: KGNodeType
  name: string
  properties: Record<string, unknown>
  first_seen_tick: number
  last_updated_tick: number
}

export type KGEdge = {
  id: string
  source_id: string
  target_id: string
  type: KGEdgeType
  weight: number         // [0, 1]
  properties: Record<string, unknown>
  formed_tick: number
}

export type KnowledgeGraph = {
  nodes: Map<string, KGNode>
  edges: Map<string, KGEdge>
}

// ─── 创建 ───

export function createKnowledgeGraph(): KnowledgeGraph {
  return {
    nodes: new Map(),
    edges: new Map(),
  }
}

// ─── 节点操作 ───

export function addNode(
  graph: KnowledgeGraph,
  id: string,
  type: KGNodeType,
  name: string,
  currentTick: number,
  properties: Record<string, unknown> = {},
): void {
  if (graph.nodes.has(id)) {
    const existing = graph.nodes.get(id)!
    existing.last_updated_tick = currentTick
    Object.assign(existing.properties, properties)
    return
  }

  graph.nodes.set(id, {
    id, type, name, properties,
    first_seen_tick: currentTick,
    last_updated_tick: currentTick,
  })
}

// ─── 边操作 ───

export function addEdge(
  graph: KnowledgeGraph,
  sourceId: string,
  targetId: string,
  type: KGEdgeType,
  currentTick: number,
  weight: number = 0.5,
  properties: Record<string, unknown> = {},
): void {
  const edgeId = `${sourceId}_${type}_${targetId}`

  if (graph.edges.has(edgeId)) {
    const existing = graph.edges.get(edgeId)!
    existing.weight = weight
    Object.assign(existing.properties, properties)
    return
  }

  graph.edges.set(edgeId, {
    id: edgeId,
    source_id: sourceId,
    target_id: targetId,
    type, weight, properties,
    formed_tick: currentTick,
  })
}

export function removeEdge(graph: KnowledgeGraph, sourceId: string, targetId: string, type: KGEdgeType): void {
  const edgeId = `${sourceId}_${type}_${targetId}`
  graph.edges.delete(edgeId)
}

// ─── 同步 ───

/**
 * 从世界状态同步知识图谱
 */
export function syncKnowledgeGraph(
  graph: KnowledgeGraph,
  orgs: Array<{
    id: string
    name: string
    territory?: string[]
    relations?: Array<{ organization_id: string; type: string }>
    member_ids?: string[]
    leader_id?: string | null
  }>,
  regions: Array<{ id: string; name: string }>,
  characters: Array<{ id: string; name: string; organization_id?: string }>,
  currentTick: number,
): void {
  // 同步组织节点
  for (const org of orgs) {
    addNode(graph, org.id, 'organization', org.name, currentTick)

    // 控制关系
    for (const territoryId of org.territory ?? []) {
      addNode(graph, territoryId, 'region', territoryId, currentTick)
      addEdge(graph, org.id, territoryId, 'controls', currentTick, 0.8)
    }

    // 关系
    for (const rel of org.relations ?? []) {
      if (rel.type === 'ally') addEdge(graph, org.id, rel.organization_id, 'allied', currentTick, 0.7)
      if (rel.type === 'enemy') addEdge(graph, org.id, rel.organization_id, 'hostile', currentTick, 0.8)
      if (rel.type === 'trading_partner') addEdge(graph, org.id, rel.organization_id, 'trades_with', currentTick, 0.6)
    }

    // 成员
    for (const memberId of org.member_ids ?? []) {
      addEdge(graph, memberId, org.id, 'member_of', currentTick, 0.5)
    }
    if (org.leader_id) {
      addEdge(graph, org.leader_id, org.id, 'rules', currentTick, 0.9)
    }
  }

  // 同步地区节点
  for (const region of regions) {
    addNode(graph, region.id, 'region', region.name, currentTick)
  }

  // 同步角色节点
  for (const char of characters) {
    addNode(graph, char.id, 'character', char.name, currentTick)
    if (char.organization_id) {
      addEdge(graph, char.id, char.organization_id, 'member_of', currentTick, 0.5)
    }
  }
}

// ─── 查询 ───

/**
 * 广度优先搜索最短路径
 */
export function findShortestPath(
  graph: KnowledgeGraph,
  startId: string,
  endId: string,
  maxDepth: number = 5,
): string[] | null {
  if (startId === endId) return [startId]

  const visited = new Set<string>()
  const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startId, path: [startId] }]
  visited.add(startId)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.path.length > maxDepth) continue

    // 找到所有相邻节点
    for (const [, edge] of graph.edges) {
      let neighborId: string | null = null
      if (edge.source_id === current.nodeId) neighborId = edge.target_id
      if (edge.target_id === current.nodeId) neighborId = edge.source_id
      if (!neighborId || visited.has(neighborId)) continue

      const newPath = [...current.path, neighborId]
      if (neighborId === endId) return newPath

      visited.add(neighborId)
      queue.push({ nodeId: neighborId, path: newPath })
    }
  }

  return null // 无路径
}

/**
 * 因果链追溯 — 从事件向后追溯原因
 */
export function traceCausality(
  graph: KnowledgeGraph,
  eventId: string,
  maxDepth: number = 4,
): Array<{ event_id: string; cause_chain: string[] }> {
  const results: Array<{ event_id: string; cause_chain: string[] }> = []

  function trace(currentId: string, chain: string[], depth: number) {
    if (depth >= maxDepth) return

    for (const [, edge] of graph.edges) {
      if (edge.target_id === currentId && edge.type === 'caused_by') {
        const newChain = [edge.source_id, ...chain]
        results.push({ event_id: eventId, cause_chain: newChain })
        trace(edge.source_id, newChain, depth + 1)
      }
    }
  }

  trace(eventId, [eventId], 0)
  return results
}

/**
 * 获取实体的邻居（按关系类型过滤）
 */
export function getNeighbors(
  graph: KnowledgeGraph,
  nodeId: string,
  edgeType?: KGEdgeType,
): Array<{ node: KGNode; edge: KGEdge }> {
  const neighbors: Array<{ node: KGNode; edge: KGEdge }> = []

  for (const [, edge] of graph.edges) {
    if (edgeType && edge.type !== edgeType) continue

    let neighborId: string | null = null
    if (edge.source_id === nodeId) neighborId = edge.target_id
    if (edge.target_id === nodeId) neighborId = edge.source_id
    if (!neighborId) continue

    const node = graph.nodes.get(neighborId)
    if (node) neighbors.push({ node, edge })
  }

  return neighbors
}

/**
 * 格式化知识图谱摘要为 LLM 上下文
 */
export function formatKnowledgeGraphForLLM(
  graph: KnowledgeGraph,
  orgId: string,
): string {
  const lines: string[] = []

  // 组织的直接关系
  const neighbors = getNeighbors(graph, orgId)
  if (neighbors.length === 0) return ''

  const byType = new Map<string, Array<{ name: string; weight: number }>>()
  for (const { node, edge } of neighbors) {
    const group = byType.get(edge.type) ?? []
    group.push({ name: node.name, weight: edge.weight })
    byType.set(edge.type, group)
  }

  for (const [type, items] of byType) {
    const typeNames: Record<string, string> = {
      controls: '控制',
      hostile: '敌对',
      allied: '同盟',
      trades_with: '贸易',
      member_of: '成员',
      knows: '知晓',
    }
    const names = items.map(i => i.name).join('、')
    lines.push(`${typeNames[type] ?? type}: ${names}`)
  }

  return lines.join('\n')
}
