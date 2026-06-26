'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'

type Props = {
  world: WorldSnapshot
}

type GraphNode = {
  id: string
  label: string
  type: 'organization' | 'character'
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  orgId?: string
}

type GraphEdge = {
  source: string
  target: string
  type: string
  strength: number
}

const ORG_COLOR = '#3b82f6'
const CHAR_COLOR = '#10b981'

const EDGE_COLORS: Record<string, string> = {
  ally: '#10b981',
  enemy: '#ef4444',
  rival: '#f59e0b',
  friend: '#06b6d4',
  lover: '#ec4899',
  family: '#8b5cf6',
  mentor: '#f97316',
  subordinate: '#6366f1',
  vassal: '#6366f1',
  overlord: '#a855f7',
  trading_partner: '#84cc16',
  neutral: '#475569',
}

const RELATION_LABELS: Record<string, string> = {
  ally: '盟友', enemy: '敌人', rival: '对手', friend: '朋友',
  lover: '恋人', family: '家人', mentor: '导师', subordinate: '下属',
  vassal: '附庸', overlord: '宗主', trading_partner: '贸易伙伴', neutral: '中立',
}

function buildGraph(world: any): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const orgs: any[] = world.organizations ?? world.factions ?? []
  const chars: any[] = world.characters ?? []
  const W = 700, H = 500
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Place orgs in a circle with more spacing
  const orgRadius = Math.min(W, H) * 0.32
  orgs.forEach((org: any, i: number) => {
    const angle = (2 * Math.PI * i) / Math.max(orgs.length, 1) - Math.PI / 2
    nodes.push({
      id: org.id,
      label: org.name ?? org.id,
      type: 'organization',
      x: W / 2 + orgRadius * Math.cos(angle),
      y: H / 2 + orgRadius * Math.sin(angle),
      vx: 0, vy: 0,
      radius: 20,
      color: ORG_COLOR,
    })
    for (const rel of org.relations ?? []) {
      if (org.id < rel.organization_id) {
        edges.push({
          source: org.id,
          target: rel.organization_id,
          type: rel.type ?? 'neutral',
          strength: rel.strength ?? 50,
        })
      }
    }
  })

  // Place chars near their org with random offset
  const orgNodeMap = new Map(nodes.map(n => [n.id, n]))
  chars.forEach((char: any, i: number) => {
    const orgId = char.organization_id ?? char.faction_id
    const orgNode = orgNodeMap.get(orgId)
    const angle = Math.random() * Math.PI * 2
    const dist = 40 + Math.random() * 30
    nodes.push({
      id: char.id,
      label: char.name ?? char.id,
      type: 'character',
      x: (orgNode?.x ?? W / 2) + dist * Math.cos(angle),
      y: (orgNode?.y ?? H / 2) + dist * Math.sin(angle),
      vx: 0, vy: 0,
      radius: 8,
      color: CHAR_COLOR,
      orgId,
    })
    for (const rel of char.relations ?? []) {
      if (char.id < rel.character_id) {
        edges.push({
          source: char.id,
          target: rel.character_id,
          type: rel.type ?? 'neutral',
          strength: rel.strength ?? 50,
        })
      }
    }
  })

  return { nodes, edges }
}

// Simple force-directed simulation
function simulate(nodes: GraphNode[], edges: GraphEdge[], iterations: number) {
  const W = 700, H = 500
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (let iter = 0; iter < iterations; iter++) {
    const damping = 0.9 - iter * 0.001

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        let dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
        const force = (a.type === 'organization' && b.type === 'organization') ? 8000 : 2000
        const repulsion = force / (dist * dist)
        const fx = (dx / dist) * repulsion
        const fy = (dy / dist) * repulsion
        a.vx -= fx; a.vy -= fy
        b.vx += fx; b.vy += fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source), b = nodeMap.get(edge.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const idealDist = edge.type === 'enemy' ? 200 : 100
      const strength = Math.abs(edge.strength) * 0.5
      const attraction = (dist - idealDist) * 0.005 * strength
      const fx = (dx / dist) * attraction
      const fy = (dy / dist) * attraction
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }

    // Org-char attraction (cluster chars near their org)
    for (const node of nodes) {
      if (node.type !== 'character' || !node.orgId) continue
      const org = nodeMap.get(node.orgId)
      if (!org) continue
      const dx = org.x - node.x, dy = org.y - node.y
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const attraction = (dist - 60) * 0.01
      node.vx += (dx / dist) * attraction
      node.vy += (dy / dist) * attraction
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (W / 2 - node.x) * 0.001
      node.vy += (H / 2 - node.y) * 0.001
    }

    // Apply velocities
    for (const node of nodes) {
      node.vx *= damping
      node.vy *= damping
      node.x = Math.max(node.radius, Math.min(W - node.radius, node.x + node.vx))
      node.y = Math.max(node.radius, Math.min(H - node.radius, node.y + node.vy))
    }
  }
}

export function RelationshipGraph({ world }: Props) {
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null)
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null)

  const { nodes, edges } = React.useMemo(() => {
    const g = buildGraph(world)
    simulate(g.nodes, g.edges, 200)
    return g
  }, [world])

  const nodeMap = React.useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const connectedIds = React.useMemo(() => {
    const id = hoveredNode || selectedNode
    if (!id) return new Set<string>()
    const connected = new Set<string>([id])
    for (const edge of edges) {
      if (edge.source === id) connected.add(edge.target)
      if (edge.target === id) connected.add(edge.source)
    }
    return connected
  }, [hoveredNode, selectedNode, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-600">
        暂无实体数据
      </div>
    )
  }

  const w = world as any
  const chars: any[] = w.characters ?? []
  const orgs: any[] = w.organizations ?? w.factions ?? []

  // Find selected entity info
  const selectedEntity = selectedNode
    ? nodes.find(n => n.id === selectedNode)
    : null
  const selectedRelations = selectedNode
    ? edges.filter(e => e.source === selectedNode || e.target === selectedNode)
    : []

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">关系网络</h3>
          <svg viewBox="0 0 700 500" className="w-full" style={{ maxHeight: '50vh' }}>
            {/* Background glow for connected subgraph */}
            {connectedIds.size > 1 && (
              <g opacity={0.08}>
                {nodes.filter(n => connectedIds.has(n.id)).map(n => (
                  <circle key={`glow-${n.id}`} cx={n.x} cy={n.y} r={n.radius * 3} fill={n.color} />
                ))}
              </g>
            )}

            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodeMap.get(edge.source)
              const to = nodeMap.get(edge.target)
              if (!from || !to) return null
              const isConnected = connectedIds.has(edge.source) && connectedIds.has(edge.target)
              const isDimmed = (hoveredNode || selectedNode) && !isConnected
              const color = EDGE_COLORS[edge.type] ?? '#475569'

              // Curved edge using quadratic bezier
              const mx = (from.x + to.x) / 2
              const my = (from.y + to.y) / 2
              const dx = to.x - from.x
              const dy = to.y - from.y
              const dist = Math.sqrt(dx * dx + dy * dy)
              // Perpendicular offset for curve
              const curvature = 0.15
              const cx = mx + (-dy / dist) * dist * curvature
              const cy = my + (dx / dist) * dist * curvature

              return (
                <g key={i}>
                  <path
                    d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                    fill="none"
                    stroke={isDimmed ? '#1e293b' : color}
                    strokeWidth={isConnected ? Math.max(1.5, edge.strength * 0.03) : 0.8}
                    strokeOpacity={isDimmed ? 0.15 : isConnected ? 0.7 : 0.25}
                    strokeDasharray={edge.type === 'enemy' ? '6 3' : undefined}
                  />
                  {/* Edge label on hover */}
                  {isConnected && connectedIds.size <= 4 && (
                    <text
                      x={cx}
                      y={cy - 4}
                      textAnchor="middle"
                      className="pointer-events-none fill-slate-400 text-[8px]"
                    >
                      {RELATION_LABELS[edge.type] ?? edge.type}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const isHovered = hoveredNode === node.id
              const isSelected = selectedNode === node.id
              const isDimmed = (hoveredNode || selectedNode) && !connectedIds.has(node.id)
              const active = isHovered || isSelected
              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                >
                  {/* Glow ring */}
                  {active && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 6}
                      fill="none"
                      stroke={node.color}
                      strokeWidth={2}
                      strokeOpacity={0.3}
                    />
                  )}
                  {/* Main circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? node.radius + 2 : node.radius}
                    fill={node.color}
                    fillOpacity={isDimmed ? 0.1 : active ? 0.4 : 0.2}
                    stroke={node.color}
                    strokeWidth={active ? 2 : 1}
                    strokeOpacity={isDimmed ? 0.2 : active ? 1 : 0.6}
                  />
                  {/* Icon for org vs char */}
                  <text
                    x={node.x}
                    y={node.y + (node.type === 'organization' ? 5 : 3)}
                    textAnchor="middle"
                    className="pointer-events-none"
                    fontSize={node.type === 'organization' ? 14 : 10}
                    opacity={isDimmed ? 0.2 : 0.8}
                  >
                    {node.type === 'organization' ? '🏛' : '👤'}
                  </text>
                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + node.radius + (node.type === 'organization' ? 16 : 12)}
                    textAnchor="middle"
                    className="pointer-events-none"
                    fontSize={node.type === 'organization' ? 11 : 9}
                    fill={isDimmed ? '#334155' : active ? '#e2e8f0' : '#94a3b8'}
                    fontWeight={node.type === 'organization' ? 600 : 400}
                  >
                    {node.label}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ORG_COLOR }} />
              组织
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHAR_COLOR }} />
              角色
            </div>
            {Object.entries(EDGE_COLORS).slice(0, 6).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="h-0.5 w-4" style={{ backgroundColor: color }} />
                {RELATION_LABELS[type] ?? type}
              </div>
            ))}
          </div>
        </div>

        {/* Selected entity detail card */}
        {selectedEntity && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{selectedEntity.type === 'organization' ? '🏛' : '👤'}</span>
              <h3 className="text-sm font-semibold text-slate-200">{selectedEntity.label}</h3>
              <span className="ml-auto text-xs text-slate-500">
                {selectedEntity.type === 'organization' ? '组织' : '角色'}
              </span>
            </div>
            {selectedRelations.length > 0 ? (
              <div className="space-y-1">
                {selectedRelations.map((rel, i) => {
                  const otherId = rel.source === selectedNode ? rel.target : rel.source
                  const other = nodeMap.get(otherId)
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">{other?.label ?? otherId}</span>
                      <span className={`rounded px-1.5 py-0.5 ${
                        rel.type === 'ally' || rel.type === 'friend' ? 'bg-green-900/50 text-green-400' :
                        rel.type === 'enemy' || rel.type === 'rival' ? 'bg-red-900/50 text-red-400' :
                        rel.type === 'lover' || rel.type === 'family' ? 'bg-pink-900/50 text-pink-400' :
                        'bg-slate-800 text-slate-500'
                      }`}>
                        {RELATION_LABELS[rel.type] ?? rel.type}
                      </span>
                      <span className="text-slate-600">强度 {rel.strength.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-600">暂无关系</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
