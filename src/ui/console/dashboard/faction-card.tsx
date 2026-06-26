'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'
import type { TickSnapshot } from '@/core/sim/history-snapshot'
import { fmt2 } from '@/lib/format'
import { OrgTrendChart, CustomMetricTrendChart } from './charts'

type Props = {
  world: WorldSnapshot
  selectedFactionId: string | null
  onSelectFaction: (id: string | null) => void
}

export function FactionDetail({ world, selectedFactionId, onSelectFaction }: Props) {
  const w = world as any
  const orgs: any[] = w.organizations ?? w.factions ?? []
  const chars: any[] = w.characters ?? []
  const snapshots: TickSnapshot[] = w.history_snapshots ?? []
  const selected = orgs.find((o: any) => o.id === selectedFactionId)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Faction list */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org: any) => (
            <button
              key={org.id}
              onClick={() => onSelectFaction(org.id)}
              className={`rounded-lg border p-3 text-left transition ${
                selectedFactionId === org.id
                  ? 'border-blue-600 bg-blue-950/30'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-600'
              }`}
            >
              <div className="text-sm font-medium text-slate-200">{org.name ?? org.id}</div>
              <div className="mt-1 text-xs text-slate-500">{org.type ?? org.category ?? '未知类型'}</div>
              <div className="mt-2 flex gap-3 text-xs text-slate-600">
                <span>影响 {fmt2(org.influence_score ?? 0)}</span>
                <span>军事 {fmt2(org.military_strength ?? 0)}</span>
                <span>经济 {fmt2(org.economic_power ?? 0)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Selected faction detail */}
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">{selected.name}</h2>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {selected.type ?? selected.category ?? ''}
                </span>
                <span className="ml-auto text-xs text-slate-600">{selected.status ?? 'stable'}</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">
                {selected.description ?? selected.history ?? selected.ideology ?? '暂无描述'}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="影响力" value={fmt2(selected.influence_score ?? 0)} color="text-blue-400" />
              <StatCard label="军事力量" value={fmt2(selected.military_strength ?? 0)} color="text-red-400" />
              <StatCard label="经济实力" value={fmt2(selected.economic_power ?? 0)} color="text-green-400" />
              <StatCard label="凝聚力" value={fmt2(selected.cohesion ?? 0)} color="text-purple-400" />
              <StatCard label="公众声誉" value={fmt2(selected.public_reputation ?? selected.public_perception ?? 0)} color="text-yellow-400" />
              <StatCard label="资源" value={fmt2(selected.resources ?? 0)} color="text-cyan-400" />
            </div>

            {/* Population */}
            {selected.population > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">人口规模</h3>
                <div className="text-2xl font-bold text-indigo-400">
                  {selected.population?.toLocaleString() ?? 0}
                </div>
              </div>
            )}

            {/* Custom Metrics */}
            {selected.custom_metric_defs?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">自定义指标</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {selected.custom_metric_defs.map((def: any) => {
                    const value = selected.custom_metrics?.[def.key] ?? def.initial ?? 0
                    const range = def.max - def.min
                    const pct = range > 0 ? ((value - def.min) / range) * 100 : 50
                    return (
                      <div key={def.key} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                        <div className="text-xs text-slate-500">{def.name}</div>
                        <div className="text-sm font-bold text-slate-200">
                          {typeof value === 'number' ? value.toLocaleString() : value}
                          {def.unit && <span className="ml-1 text-xs text-slate-600">{def.unit}</span>}
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-slate-800">
                          <div
                            className="h-1 rounded-full bg-blue-500"
                            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Custom Metric Trend Charts */}
            {snapshots.length >= 2 && selected.custom_metric_defs?.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {selected.custom_metric_defs.slice(0, 6).map((def: any) => (
                  <CustomMetricTrendChart
                    key={def.key}
                    snapshots={snapshots}
                    entity_id={selected.id}
                    entity_type="organization"
                    metric_key={def.key}
                    metric_name={def.name}
                    unit={def.unit}
                  />
                ))}
              </div>
            )}

            {/* Goals */}
            {selected.goals?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">目标</h3>
                <div className="space-y-2">
                  {selected.goals.map((goal: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 rounded-full ${
                        goal.status === 'completed' ? 'bg-green-500' :
                        goal.status === 'active' ? 'bg-blue-500' :
                        goal.status === 'abandoned' ? 'bg-red-500' : 'bg-slate-600'
                      }`} />
                      <span className="text-slate-300">{goal.description}</span>
                      {goal.progress > 0 && goal.progress < 1 && (
                        <span className="ml-auto text-xs text-slate-600">{(goal.progress * 100).toFixed(2)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {selected.relations?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">外交关系</h3>
                <div className="space-y-1">
                  {selected.relations.map((rel: any, i: number) => {
                    const targetOrg = orgs.find((o: any) => o.id === rel.organization_id)
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{targetOrg?.name ?? rel.organization_id}</span>
                        <span className={`rounded px-1.5 py-0.5 ${
                          rel.type === 'ally' ? 'bg-green-900/50 text-green-400' :
                          rel.type === 'enemy' ? 'bg-red-900/50 text-red-400' :
                          rel.type === 'rival' ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {rel.type}
                        </span>
                        <span className="text-slate-600">强度 {fmt2(rel.strength)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Members */}
            {selected.member_ids?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  成员 ({selected.member_ids.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selected.member_ids.map((memberId: string) => {
                    const char = chars.find((c: any) => c.id === memberId)
                    return (
                      <span key={memberId} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
                        {char?.name ?? memberId}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Territory */}
            {selected.territory?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">领地</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.territory.map((t: string, i: number) => (
                    <span key={i} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-cyan-400">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Trend charts */}
            {snapshots.length >= 2 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <OrgTrendChart snapshots={snapshots} metric="influence_score" title="影响力趋势" />
                <OrgTrendChart snapshots={snapshots} metric="military_strength" title="军事力量趋势" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-600">{label}</div>
    </div>
  )
}
