'use client'

import React from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TickSnapshot, OrgSnapshot } from '@/core/sim/history-snapshot'

// ─── Color palette for organizations ───
const ORG_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
]

// ─── Line chart: org metric trend over ticks ───

type OrgTrendChartProps = {
  snapshots: TickSnapshot[]
  metric: keyof OrgSnapshot
  title: string
  unit?: string
}

export function OrgTrendChart({ snapshots, metric, title, unit }: OrgTrendChartProps) {
  // Collect all org IDs that appear in snapshots
  const orgIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const snap of snapshots) {
      for (const org of snap.organizations) {
        ids.add(org.id)
      }
    }
    return Array.from(ids)
  }, [snapshots])

  // Build data: one row per tick, one key per org
  const data = React.useMemo(() => {
    return snapshots.map(snap => {
      const row: Record<string, any> = { tick: snap.tick }
      for (const org of snap.organizations) {
        row[org.id] = org[metric] ?? 0
      }
      return row
    })
  }, [snapshots, metric])

  // 计算动态 Y 轴范围，让变化撑满图表
  const yDomain = React.useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const row of data) {
      for (const id of orgIds) {
        const v = row[id]
        if (typeof v === 'number') {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 100]
    if (min === max) return [min - 5, max + 5]
    const padding = (max - min) * 0.1
    return [Math.max(0, min - padding), max + padding]
  }, [data, orgIds])

  // Build org name lookup from latest snapshot
  const orgNameMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const snap of snapshots) {
      for (const org of snap.organizations) {
        map.set(org.id, org.name)
      }
    }
    return map
  }, [snapshots])

  if (snapshots.length < 2 || orgIds.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-600">
        需要至少 2 个 tick 的数据才能显示趋势
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title} {unit && <span className="text-slate-600">({unit})</span>}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis domain={yDomain} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => orgNameMap.get(value) ?? value}
          />
          {orgIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={ORG_COLORS[i % ORG_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={id}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Bar chart: org comparison at latest tick ───

type OrgComparisonBarProps = {
  snapshots: TickSnapshot[]
  metric: keyof OrgSnapshot
  title: string
}

export function OrgComparisonBar({ snapshots, metric, title }: OrgComparisonBarProps) {
  const latest = snapshots[snapshots.length - 1]
  if (!latest || latest.organizations.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-600">
        暂无组织数据
      </div>
    )
  }

  const data = latest.organizations.map(org => ({
    name: org.name,
    value: org[metric] ?? 0,
  }))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            width={100}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── World mood line chart ───

type WorldMoodChartProps = {
  snapshots: TickSnapshot[]
}

const MOOD_ORDER = ['terrible', 'desperate', 'tense', 'anxious', 'calm', 'hopeful', 'jubilant']

export function WorldMoodChart({ snapshots }: WorldMoodChartProps) {
  const data = React.useMemo(() => {
    return snapshots.map(snap => ({
      tick: snap.tick,
      mood: MOOD_ORDER.indexOf(snap.world_mood),
      mood_label: snap.world_mood,
      events: snap.event_count,
    }))
  }, [snapshots])

  if (snapshots.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-600">
        需要至少 2 个 tick 的数据
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">世界基调趋势</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            domain={[-1, MOOD_ORDER.length]}
            tickFormatter={(v: number) => MOOD_ORDER[v] ?? ''}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(label: any) => `Tick ${label}`}
            formatter={(_value: any, _name: any, props: any) => [props.payload.mood_label, '基调']}
          />
          <Line type="monotone" dataKey="mood" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Event count bar chart ───

type EventCountChartProps = {
  snapshots: TickSnapshot[]
}

export function EventCountChart({ snapshots }: EventCountChartProps) {
  const data = React.useMemo(() => {
    return snapshots.map(snap => ({
      tick: snap.tick,
      events: snap.event_count,
    }))
  }, [snapshots])

  if (snapshots.length < 2) {
    return null
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">每 Tick 事件数</h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="events" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Custom metric trend chart (dynamic, for LLM-defined metrics) ───

type CustomMetricTrendChartProps = {
  snapshots: TickSnapshot[]
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  metric_key: string
  metric_name: string
  unit?: string
}

export function CustomMetricTrendChart({
  snapshots,
  entity_id,
  entity_type,
  metric_key,
  metric_name,
  unit,
}: CustomMetricTrendChartProps) {
  const data = React.useMemo(() => {
    return snapshots
      .map(snap => {
        const entities = entity_type === 'organization'
          ? snap.organizations
          : entity_type === 'character'
            ? snap.characters
            : snap.regions
        const entity = entities.find((e: any) => e.id === entity_id)
        const value = entity?.custom_metrics?.[metric_key]
        if (value === undefined) return null
        return { tick: snap.tick, value }
      })
      .filter(Boolean)
  }, [snapshots, entity_id, entity_type, metric_key])

  if (data.length < 2) {
    return null
  }

  // 动态 Y 轴范围
  const yDomain = React.useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const row of data) {
      const v = (row as any).value
      if (typeof v === 'number') {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 100]
    if (min === max) return [min - 5, max + 5]
    const padding = (max - min) * 0.1
    return [Math.max(0, min - padding), max + padding]
  }, [data])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {metric_name} {unit ? `(${unit})` : ''}
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis domain={yDomain} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name={metric_name}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Population comparison bar chart ───

type PopulationChartProps = {
  snapshots: TickSnapshot[]
}

export function PopulationChart({ snapshots }: PopulationChartProps) {
  const latestSnap = snapshots[snapshots.length - 1]
  if (!latestSnap) return null

  const data = latestSnap.organizations
    .filter(org => org.population && org.population > 0)
    .map(org => ({
      name: org.name,
      population: org.population ?? 0,
    }))
    .sort((a, b) => b.population - a.population)
    .slice(0, 10)

  if (data.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">组织人口对比</h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={80} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="population" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
