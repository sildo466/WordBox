'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'
import type { TickSnapshot } from '@/core/sim/history-snapshot'
import { fmt2 } from '@/lib/format'
import {
  OrgTrendChart,
  OrgComparisonBar,
  WorldMoodChart,
  EventCountChart,
  PopulationChart,
  CustomMetricTrendChart,
} from './charts'

type Props = {
  world: WorldSnapshot
}

function getSnapshots(world: WorldSnapshot): TickSnapshot[] {
  return (world as any).history_snapshots ?? []
}

function getOrganizations(world: WorldSnapshot): Record<string, any>[] {
  const w = world as any
  return (w.organizations ?? w.factions ?? []) as Record<string, any>[]
}

function getCharacters(world: WorldSnapshot): Record<string, any>[] {
  return (world as any).characters ?? []
}

function getRegions(world: WorldSnapshot): Record<string, any>[] {
  return (world as any).regions ?? []
}

function MetricCard({ label, value, color, sub }: { label: string; value: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-600">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-700">{sub}</div>}
    </div>
  )
}

export function OverviewTab({ world }: Props) {
  const snapshots = getSnapshots(world)
  const orgs = getOrganizations(world)
  const chars = getCharacters(world)
  const regions = getRegions(world)
  const latest = snapshots[snapshots.length - 1]

  // Collect all custom metric keys from all orgs
  const allCustomMetricKeys = React.useMemo(() => {
    const keys = new Map<string, { name: string; unit?: string }>()
    for (const org of orgs) {
      if (org.custom_metric_defs) {
        for (const def of org.custom_metric_defs) {
          if (!keys.has(def.key)) keys.set(def.key, { name: def.name, unit: def.unit })
        }
      }
    }
    return Array.from(keys.entries())
  }, [orgs])

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Tick" value={world.tick ?? 0} color="text-blue-400" />
          <MetricCard label="组织" value={orgs.length} color="text-green-400" />
          <MetricCard label="角色" value={chars.length} color="text-yellow-400" />
          <MetricCard label="地区" value={regions.length} color="text-cyan-400" />
          <MetricCard label="快照数" value={snapshots.length} color="text-purple-400" sub="历史" />
          <MetricCard
            label="基调"
            value={latest?.world_mood ?? 'calm'}
            color="text-indigo-400"
          />
        </div>

        {/* Standard trend charts */}
        {snapshots.length >= 2 && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <OrgTrendChart snapshots={snapshots} metric="influence_score" title="势力影响力趋势" />
              <OrgTrendChart snapshots={snapshots} metric="military_strength" title="军事力量趋势" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <OrgTrendChart snapshots={snapshots} metric="economic_power" title="经济实力趋势" />
              <OrgTrendChart snapshots={snapshots} metric="cohesion" title="凝聚力趋势" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <WorldMoodChart snapshots={snapshots} />
              <EventCountChart snapshots={snapshots} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PopulationChart snapshots={snapshots} />
            </div>
          </>
        )}

        {/* Custom metric trend charts */}
        {snapshots.length >= 2 && allCustomMetricKeys.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">自定义指标趋势</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {allCustomMetricKeys.slice(0, 8).map(([key, meta]) => (
                <OrgCustomMetricChart
                  key={key}
                  snapshots={snapshots}
                  orgs={orgs}
                  metricKey={key}
                  metricName={meta.name}
                  unit={meta.unit}
                />
              ))}
            </div>
          </section>
        )}

        {/* Latest snapshot comparison */}
        {latest && latest.organizations.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <OrgComparisonBar snapshots={snapshots} metric="influence_score" title="当前势力对比 · 影响力" />
            <OrgComparisonBar snapshots={snapshots} metric="military_strength" title="当前势力对比 · 军事" />
          </div>
        )}

        {/* Org detail cards */}
        {orgs.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">组织概况</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {orgs.map((org: any) => (
                <OrgQuickCard key={org.id ?? org.name} org={org} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// Custom metric chart that shows a specific metric across all orgs
function OrgCustomMetricChart({ snapshots, orgs, metricKey, metricName, unit }: {
  snapshots: TickSnapshot[]
  orgs: Record<string, any>[]
  metricKey: string
  metricName: string
  unit?: string
}) {
  const orgIds = React.useMemo(() => {
    return orgs.filter(o => o.custom_metric_defs?.some((d: any) => d.key === metricKey)).map(o => o.id)
  }, [orgs, metricKey])

  if (orgIds.length === 0) return null

  // Use the first org that has this metric
  return (
    <CustomMetricTrendChart
      snapshots={snapshots}
      entity_id={orgIds[0]}
      entity_type="organization"
      metric_key={metricKey}
      metric_name={metricName}
      unit={unit}
    />
  )
}

function OrgQuickCard({ org }: { org: Record<string, any> }) {
  const name = org.name ?? org.id ?? '未命名'
  const type = org.type ?? org.category ?? ''
  const status = org.status ?? 'stable'
  const influence = org.influence_score ?? 0
  const military = org.military_strength ?? 0
  const economy = org.economic_power ?? 0
  const cohesion = org.cohesion ?? 0
  const population = org.population ?? 0
  const customMetrics: Record<string, number> = org.custom_metrics ?? {}

  const statusColor: Record<string, string> = {
    rising: 'text-green-400',
    stable: 'text-slate-400',
    declining: 'text-yellow-400',
    collapsed: 'text-red-400',
  }

  // Pick top 3 custom metrics to show
  const topMetrics = (org.custom_metric_defs ?? []).slice(0, 3)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-200">{name}</span>
        {type && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500">{type}</span>}
        <span className={`ml-auto text-xs ${statusColor[status] ?? 'text-slate-400'}`}>{status}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniStat label="影响" value={fmt2(influence)} color="text-blue-400" />
        <MiniStat label="军事" value={fmt2(military)} color="text-red-400" />
        <MiniStat label="经济" value={fmt2(economy)} color="text-green-400" />
        <MiniStat label="凝聚" value={fmt2(cohesion)} color="text-purple-400" />
      </div>
      {population > 0 && (
        <div className="mt-2 text-center">
          <span className="text-xs text-slate-500">人口 </span>
          <span className="text-sm font-bold text-indigo-400">{population.toLocaleString()}</span>
        </div>
      )}
      {topMetrics.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          {topMetrics.map((def: any) => {
            const val = customMetrics[def.key] ?? def.initial ?? 0
            const range = def.max - def.min
            const pct = range > 0 ? ((val - def.min) / range) * 100 : 50
            return (
              <div key={def.key} className="rounded bg-slate-950 p-1">
                <div className="text-[10px] text-slate-600">{def.name}</div>
                <div className="text-xs font-bold text-slate-300">
                  {typeof val === 'number' ? val.toLocaleString() : val}
                </div>
                <div className="mt-0.5 h-0.5 rounded-full bg-slate-800">
                  <div
                    className="h-0.5 rounded-full bg-blue-500"
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  )
}
