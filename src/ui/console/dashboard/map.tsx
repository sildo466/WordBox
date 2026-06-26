'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'
import type { TickSnapshot } from '@/core/sim/history-snapshot'
import { fmt2 } from '@/lib/format'

type Props = {
  world: WorldSnapshot
}

type MapLayer = 'faction' | 'danger' | 'prosperity' | 'population'

const LAYER_CONFIG: { key: MapLayer; label: string; colorFn: (region: any, orgs: Map<string, any>) => string }[] = [
  {
    key: 'faction',
    label: '势力控制',
    colorFn: (region, orgs) => {
      const orgId = region.controlling_organization_id
      if (!orgId) return '#334155'
      const idx = Array.from(orgs.keys()).indexOf(orgId)
      return FACTION_COLORS[idx % FACTION_COLORS.length]
    },
  },
  {
    key: 'danger',
    label: '危险度',
    colorFn: (region) => {
      const d = region.danger_level ?? 0
      if (d > 70) return '#ef4444'
      if (d > 40) return '#f59e0b'
      if (d > 15) return '#84cc16'
      return '#10b981'
    },
  },
  {
    key: 'prosperity',
    label: '繁荣度',
    colorFn: (region) => {
      const p = region.prosperity ?? 50
      if (p > 75) return '#10b981'
      if (p > 50) return '#84cc16'
      if (p > 25) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'population',
    label: '人口',
    colorFn: (region) => {
      const p = typeof region.population === 'number' ? region.population : 50
      if (p > 1000) return '#8b5cf6'
      if (p > 500) return '#6366f1'
      if (p > 100) return '#3b82f6'
      return '#1e40af'
    },
  },
]

const FACTION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
]

type RegionNode = {
  id: string
  name: string
  x: number
  y: number
  radius: number
  data: any
}

type RegionEdge = {
  from: string
  to: string
  type: string
}

export function MapPanel({ world }: Props) {
  const [activeLayer, setActiveLayer] = React.useState<MapLayer>('faction')
  const [selectedRegion, setSelectedRegion] = React.useState<any | null>(null)
  const [hoveredRegion, setHoveredRegion] = React.useState<string | null>(null)

  const w = world as any
  const regions: any[] = w.regions ?? []
  const orgs: any[] = w.organizations ?? w.factions ?? []
  const orgMap = new Map(orgs.map((o: any) => [o.id, o]))
  const snapshots: TickSnapshot[] = w.history_snapshots ?? []

  // Build nodes from region coordinates
  const nodes: RegionNode[] = React.useMemo(() => {
    if (regions.length === 0) return []

    const PADDING = 60
    const WIDTH = 700
    const HEIGHT = 500

    // Check if regions have valid coordinates (not all 0,0)
    const hasCoords = regions.some((r: any) => (r.coordinates?.x ?? 0) !== 0 || (r.coordinates?.y ?? 0) !== 0)

    if (hasCoords) {
      // Normalize real coordinates to SVG space
      const xs = regions.map(r => r.coordinates?.x ?? 0)
      const ys = regions.map(r => r.coordinates?.y ?? 0)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const rangeX = maxX - minX || 1
      const rangeY = maxY - minY || 1

      return regions.map((region: any) => {
        const nx = ((region.coordinates?.x ?? 0) - minX) / rangeX
        const ny = ((region.coordinates?.y ?? 0) - minY) / rangeY
        const pop = typeof region.population === 'number' ? region.population : 100
        return {
          id: region.id,
          name: region.name ?? region.id,
          x: PADDING + nx * (WIDTH - 2 * PADDING),
          y: PADDING + ny * (HEIGHT - 2 * PADDING),
          radius: Math.max(18, Math.min(40, 15 + Math.sqrt(pop) * 0.5)),
          data: region,
        }
      })
    }

    // No valid coordinates — use circular layout with connections-based spacing
    const cx = WIDTH / 2, cy = HEIGHT / 2
    const layoutRadius = Math.min(WIDTH, HEIGHT) * 0.32
    return regions.map((region: any, i: number) => {
      const angle = (2 * Math.PI * i) / regions.length - Math.PI / 2
      const pop = typeof region.population === 'number' ? region.population : 100
      return {
        id: region.id,
        name: region.name ?? region.id,
        x: cx + layoutRadius * Math.cos(angle),
        y: cy + layoutRadius * Math.sin(angle),
        radius: Math.max(18, Math.min(40, 15 + Math.sqrt(pop) * 0.5)),
        data: region,
      }
    })
  }, [regions])

  // Build edges from connections
  const edges: RegionEdge[] = React.useMemo(() => {
    const result: RegionEdge[] = []
    for (const region of regions) {
      const conns = region.connections ?? []
      for (const conn of conns) {
        // Only add each edge once (from < to)
        if (region.id < conn.region_id) {
          result.push({ from: region.id, to: conn.region_id, type: conn.type ?? 'road' })
        }
      }
    }
    return result
  }, [regions])

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const layerConfig = LAYER_CONFIG.find(l => l.key === activeLayer)!

  if (regions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-600">
        暂无地区数据
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Layer controls */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">图层：</span>
          {LAYER_CONFIG.map(layer => (
            <button
              key={layer.key}
              onClick={() => setActiveLayer(layer.key)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                activeLayer === layer.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>

        {/* SVG Map */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <svg viewBox="0 0 700 500" className="w-full" style={{ maxHeight: '60vh' }}>
            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodeMap.get(edge.from)
              const to = nodeMap.get(edge.to)
              if (!from || !to) return null
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#334155"
                  strokeWidth={1.5}
                  strokeDasharray={edge.type === 'sea_route' ? '4 4' : undefined}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const color = layerConfig.colorFn(node.data, orgMap)
              const isHovered = hoveredRegion === node.id
              const isSelected = selectedRegion?.id === node.id
              return (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isHovered || isSelected ? node.radius + 4 : node.radius}
                    fill={color}
                    fillOpacity={0.3}
                    stroke={isHovered || isSelected ? '#e2e8f0' : color}
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredRegion(node.id)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    onClick={() => setSelectedRegion(node.data)}
                  />
                  <text
                    x={node.x}
                    y={node.y + node.radius + 14}
                    textAnchor="middle"
                    className="pointer-events-none fill-slate-400 text-[10px]"
                  >
                    {node.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Region detail card */}
        {selectedRegion && (
          <RegionDetailCard
            region={selectedRegion}
            org={orgMap.get(selectedRegion.controlling_organization_id)}
            onClose={() => setSelectedRegion(null)}
            snapshots={snapshots}
          />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {activeLayer === 'faction' && orgs.map((org: any, i: number) => (
            <div key={org.id} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: FACTION_COLORS[i % FACTION_COLORS.length] }}
              />
              {org.name}
            </div>
          ))}
          {activeLayer === 'danger' && (
            <>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500" />极高</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-yellow-500" />高</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-lime-500" />中</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-emerald-500" />低</div>
            </>
          )}
          {activeLayer === 'prosperity' && (
            <>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-emerald-500" />繁荣</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-lime-500" />良好</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-yellow-500" />一般</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500" />萧条</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RegionDetailCard({
  region,
  org,
  onClose,
  snapshots,
}: {
  region: any
  org: any | undefined
  onClose: () => void
  snapshots: TickSnapshot[]
}) {
  // Get region history from snapshots
  const history = React.useMemo(() => {
    return snapshots.map(snap => {
      const rs = snap.regions.find((r: any) => r.id === region.id)
      return rs ? { tick: snap.tick, ...rs } : null
    }).filter(Boolean)
  }, [snapshots, region.id])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{region.name ?? region.id}</h3>
        <button onClick={onClose} className="text-xs text-slate-600 hover:text-slate-400">关闭</button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">{region.description || '暂无描述'}</p>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="地形" value={region.terrain ?? '-'} />
        <MiniStat label="危险度" value={fmt2(region.danger_level ?? 0)} />
        <MiniStat label="繁荣度" value={fmt2(region.prosperity ?? 50)} />
        <MiniStat label="人口" value={typeof region.population === 'number' ? fmt2(region.population) : String(region.population ?? '-')} />
      </div>
      {org && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-slate-500">控制者：</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">{org.name}</span>
        </div>
      )}
      {region.resources?.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-slate-500">资源：</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {region.resources.map((res: any, i: number) => (
              <span key={i} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {res.type} ({fmt2(res.abundance)})
              </span>
            ))}
          </div>
        </div>
      )}
      {region.notable_locations?.length > 0 && (
        <div>
          <span className="text-xs text-slate-500">地标：</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {region.notable_locations.map((loc: string, i: number) => (
              <span key={i} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-cyan-400">
                {loc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-800/50 px-2 py-1.5 text-center">
      <div className="text-sm font-bold text-slate-200">{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  )
}
