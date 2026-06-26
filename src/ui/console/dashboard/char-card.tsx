'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'
import type { TickSnapshot } from '@/core/sim/history-snapshot'
import { fmt2 } from '@/lib/format'

type Props = {
  world: WorldSnapshot
  selectedCharacterId: string | null
  onSelectCharacter: (id: string | null) => void
}

export function CharacterDetail({ world, selectedCharacterId, onSelectCharacter }: Props) {
  const w = world as any
  const chars: any[] = w.characters ?? []
  const orgs: any[] = w.organizations ?? w.factions ?? []
  const snapshots: TickSnapshot[] = w.history_snapshots ?? []
  const selected = chars.find((c: any) => c.id === selectedCharacterId)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Character list */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {chars.map((char: any) => {
            const org = orgs.find((o: any) => o.id === (char.organization_id ?? char.faction_id))
            return (
              <button
                key={char.id}
                onClick={() => onSelectCharacter(char.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  selectedCharacterId === char.id
                    ? 'border-blue-600 bg-blue-950/30'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-medium text-slate-200">{char.name ?? char.id}</div>
                {char.title && <div className="mt-0.5 text-xs text-slate-500">{char.title}</div>}
                <div className="mt-1 flex gap-2 text-xs text-slate-600">
                  {org && <span className="text-green-400">{org.name}</span>}
                  {char.role_in_org && <span>{char.role_in_org}</span>}
                </div>
                <div className="mt-1 flex gap-3 text-xs text-slate-600">
                  <span>活力 {fmt2(char.vitality ?? 100)}</span>
                  <span>士气 {fmt2(char.morale ?? 70)}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected character detail */}
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">{selected.name}</h2>
                {selected.title && <span className="text-sm text-slate-400">{selected.title}</span>}
                <span className={`ml-auto rounded px-2 py-0.5 text-xs ${
                  selected.status === 'alive' ? 'bg-green-900/50 text-green-400' :
                  selected.status === 'dead' ? 'bg-red-900/50 text-red-400' :
                  selected.status === 'imprisoned' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {selected.status ?? 'alive'}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">
                {selected.description || '暂无描述'}
              </p>
            </div>

            {/* Condition badge */}
            {selected.condition && (
              <ConditionBadge condition={selected.condition} />
            )}

            {/* Attribute groups */}
            <AttributeGroup title="🫀 身体" defaultOpen attrs={[
              { label: '活力', key: 'vitality', value: selected.vitality, max: 100, color: 'text-green-400' },
              { label: '健康', key: 'health', value: selected.health, max: 100, color: 'text-emerald-400' },
              { label: '体力', key: 'energy', value: selected.energy, max: 100, color: 'text-teal-400' },
              { label: '压力', key: 'stress', value: selected.stress, max: 100, color: 'text-orange-400', invert: true },
              { label: '衰老', key: 'aging', value: selected.aging, max: 100, color: 'text-stone-400', invert: true },
            ]} trends={selected.trends} />
            <AttributeGroup title="🧠 精神" defaultOpen attrs={[
              { label: '士气', key: 'morale', value: selected.morale, max: 100, color: 'text-yellow-400' },
              { label: '专注', key: 'focus', value: selected.focus, max: 100, color: 'text-amber-400' },
              { label: '理智', key: 'sanity', value: selected.sanity, max: 100, color: 'text-rose-400' },
            ]} trends={selected.trends} />
            <AttributeGroup title="👥 社会" attrs={[
              { label: '影响力', key: 'influence', value: selected.influence, max: 100, color: 'text-blue-400' },
              { label: '声望', key: 'reputation', value: selected.reputation, max: 100, color: 'text-indigo-400' },
              { label: '地位', key: 'standing', value: selected.standing, max: 100, color: 'text-violet-400' },
              { label: '忠诚', key: 'loyalty', value: selected.loyalty, max: 100, color: 'text-sky-400' },
            ]} trends={selected.trends} />
            <AttributeGroup title="💰 资源" attrs={[
              { label: '财富', key: 'wealth', value: selected.wealth, color: 'text-cyan-400' },
              { label: '军队', key: 'army', value: selected.army, color: 'text-red-400' },
              { label: '随从', key: 'retainers', value: selected.retainers, color: 'text-lime-400' },
              { label: '秘密', key: 'secrets', value: selected.secrets, color: 'text-purple-400' },
            ]} trends={selected.trends} />
            <AttributeGroup title="⚔️ 能力" attrs={[
              { label: '武力', key: 'martial', value: selected.martial, color: 'text-red-400' },
              { label: '谋略', key: 'cunning', value: selected.cunning, color: 'text-purple-400' },
              { label: '魅力', key: 'charisma', value: selected.charisma, color: 'text-pink-400' },
              { label: '学识', key: 'lore', value: selected.lore, color: 'text-blue-400' },
            ]} trends={selected.trends} />

            {/* Personality & Abilities */}
            <div className="grid gap-4 lg:grid-cols-2">
              {(selected.personality?.length > 0 || selected.personality_params) && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">性格</h3>
                  {selected.personality?.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {selected.personality.map((trait: string, i: number) => (
                        <span key={i} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{trait}</span>
                      ))}
                    </div>
                  )}
                  {selected.personality_params && (
                    <div className="space-y-1.5">
                      <PersonalityBar label="稳定" value={selected.personality_params.stability} color="bg-blue-500" />
                      <PersonalityBar label="能动" value={selected.personality_params.agency} color="bg-amber-500" />
                      <PersonalityBar label="共情" value={selected.personality_params.empathy} color="bg-pink-500" />
                      <PersonalityBar label="依恋" value={selected.personality_params.attachment} color="bg-purple-500" />
                      <PersonalityBar label="开放" value={selected.personality_params.openness} color="bg-teal-500" />
                    </div>
                  )}
                </div>
              )}
              {selected.abilities?.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">能力</h3>
                  <div className="flex flex-wrap gap-1">
                    {selected.abilities.map((ability: string, i: number) => (
                      <span key={i} className="rounded bg-blue-900/30 px-2 py-0.5 text-xs text-blue-300">{ability}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Desires */}
            {selected.desires?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">欲望</h3>
                <div className="space-y-1">
                  {selected.desires.map((desire: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">{desire.type}</span>
                      <span className="text-slate-300">{desire.description}</span>
                      <span className="ml-auto text-slate-600">强度 {fmt2(desire.intensity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current task */}
            {selected.current_task && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">当前任务</h3>
                <div className="text-sm text-slate-300">{selected.current_task.description}</div>
                <div className="mt-1 flex gap-3 text-xs text-slate-600">
                  <span>状态: {selected.current_task.status}</span>
                  <span>优先级: {fmt2(selected.current_task.priority)}</span>
                  {selected.current_task.source && <span>来源: {selected.current_task.source}</span>}
                </div>
              </div>
            )}

            {/* Relations */}
            {selected.relations?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">关系</h3>
                <div className="space-y-1">
                  {selected.relations.map((rel: any, i: number) => {
                    const target = chars.find((c: any) => c.id === rel.character_id)
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{target?.name ?? rel.character_id}</span>
                        <span className={`rounded px-1.5 py-0.5 ${
                          rel.type === 'ally' || rel.type === 'friend' ? 'bg-green-900/50 text-green-400' :
                          rel.type === 'enemy' || rel.type === 'rival' ? 'bg-red-900/50 text-red-400' :
                          rel.type === 'lover' || rel.type === 'family' ? 'bg-pink-900/50 text-pink-400' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {rel.type}
                        </span>
                        <span className="text-slate-600">强度 {fmt2(rel.strength)}</span>
                        {rel.notes && <span className="text-slate-600">· {rel.notes}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* History trend */}
            {snapshots.length >= 2 && (
              <CharacterTrendChart charId={selected.id} snapshots={snapshots} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Trend line definitions ───

type TrendLineDef = { key: string; label: string; stroke: string; group: string }

const TREND_LINES: TrendLineDef[] = [
  // 身体 (green)
  { key: 'vitality', label: '活力', stroke: '#10b981', group: '身体' },
  { key: 'health', label: '健康', stroke: '#34d399', group: '身体' },
  { key: 'energy', label: '体力', stroke: '#6ee7b7', group: '身体' },
  { key: 'stress', label: '压力', stroke: '#a7f3d0', group: '身体' },
  { key: 'aging', label: '衰老', stroke: '#d1fae5', group: '身体' },
  // 精神 (yellow)
  { key: 'morale', label: '士气', stroke: '#f59e0b', group: '精神' },
  { key: 'focus', label: '专注', stroke: '#fbbf24', group: '精神' },
  { key: 'sanity', label: '理智', stroke: '#fcd34d', group: '精神' },
  // 社会 (blue)
  { key: 'influence', label: '影响力', stroke: '#3b82f6', group: '社会' },
  { key: 'reputation', label: '声望', stroke: '#60a5fa', group: '社会' },
  { key: 'standing', label: '地位', stroke: '#93c5fd', group: '社会' },
  { key: 'loyalty', label: '忠诚', stroke: '#bfdbfe', group: '社会' },
  // 资源 (cyan)
  { key: 'wealth', label: '财富', stroke: '#06b6d4', group: '资源' },
  { key: 'army', label: '军队', stroke: '#22d3ee', group: '资源' },
  { key: 'retainers', label: '随从', stroke: '#67e8f9', group: '资源' },
  { key: 'secrets', label: '秘密', stroke: '#a5f3fc', group: '资源' },
  // 能力 (purple)
  { key: 'martial', label: '武力', stroke: '#8b5cf6', group: '能力' },
  { key: 'cunning', label: '谋略', stroke: '#a78bfa', group: '能力' },
  { key: 'charisma', label: '魅力', stroke: '#c4b5fd', group: '能力' },
  { key: 'lore', label: '学识', stroke: '#ddd6fe', group: '能力' },
]

// Default visible lines
const DEFAULT_VISIBLE = new Set(['vitality', 'morale', 'influence', 'wealth'])

const GROUP_COLORS: Record<string, string> = {
  '身体': 'bg-green-800/50 text-green-400 border-green-700',
  '精神': 'bg-yellow-800/50 text-yellow-400 border-yellow-700',
  '社会': 'bg-blue-800/50 text-blue-400 border-blue-700',
  '资源': 'bg-cyan-800/50 text-cyan-400 border-cyan-700',
  '能力': 'bg-purple-800/50 text-purple-400 border-purple-700',
}

function CharacterTrendChart({ charId, snapshots }: { charId: string; snapshots: TickSnapshot[] }) {
  const [Chart, setChart] = React.useState<any>(null)
  const [visible, setVisible] = React.useState<Set<string>>(DEFAULT_VISIBLE)
  const [showPicker, setShowPicker] = React.useState(false)

  React.useEffect(() => {
    import('recharts').then(mod => {
      setChart(() => mod.LineChart)
    })
  }, [])

  // Extract all tracked fields from snapshots
  const data = React.useMemo(() => {
    return snapshots.map(snap => {
      const cs = snap.characters.find(c => c.id === charId)
      if (!cs) return null
      const row: Record<string, any> = { tick: snap.tick }
      for (const def of TREND_LINES) {
        row[def.key] = (cs as any)[def.key] ?? 0
      }
      return row
    }).filter(Boolean)
  }, [snapshots, charId])

  // Dynamic Y-axis: compute min/max across all visible lines
  const yDomain = React.useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const row of data) {
      if (!row) continue
      for (const def of TREND_LINES) {
        if (!visible.has(def.key)) continue
        const v = row[def.key]
        if (typeof v === 'number' && isFinite(v)) {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 100]
    if (min === max) return [Math.max(0, min - 5), max + 5]
    const padding = (max - min) * 0.1
    return [Math.max(0, min - padding), max + padding]
  }, [data, visible])

  // Group lines by category for the picker (must be before early return)
  const groups = React.useMemo(() => {
    const map = new Map<string, TrendLineDef[]>()
    for (const def of TREND_LINES) {
      if (!map.has(def.group)) map.set(def.group, [])
      map.get(def.group)!.push(def)
    }
    return map
  }, [])

  if (!Chart || data.length < 2) return null

  const { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = require('recharts')

  const toggleLine = (key: string) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">属性趋势</h3>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:text-slate-200"
        >
          {showPicker ? '收起选择' : '选择属性'}
        </button>
      </div>

      {/* Attribute picker */}
      {showPicker && (
        <div className="mb-3 space-y-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          {Array.from(groups.entries()).map(([group, defs]) => (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-xs text-slate-500">{group}</span>
              {defs.map(def => {
                const isActive = visible.has(def.key)
                return (
                  <button
                    key={def.key}
                    onClick={() => toggleLine(def.key)}
                    className={`rounded border px-2 py-0.5 text-[10px] transition ${
                      isActive
                        ? GROUP_COLORS[group]
                        : 'border-slate-700 bg-slate-900 text-slate-600'
                    }`}
                  >
                    {def.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Active line chips */}
      {!showPicker && (
        <div className="mb-2 flex flex-wrap gap-1">
          {TREND_LINES.filter(d => visible.has(d.key)).map(def => (
            <span
              key={def.key}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition hover:opacity-70"
              style={{ backgroundColor: def.stroke + '20', color: def.stroke }}
              onClick={() => toggleLine(def.key)}
            >
              {def.label}
            </span>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <Chart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis domain={yDomain} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(label: any) => `Tick ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {TREND_LINES.filter(d => visible.has(d.key)).map(def => (
            <Line
              key={def.key}
              type="monotone"
              dataKey={def.key}
              stroke={def.stroke}
              strokeWidth={2}
              dot={false}
              name={def.label}
            />
          ))}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({ label, value, max, color }: { label: string; value: string | number; max: number; color: string }) {
  const numValue = typeof value === 'string' ? Number(value) : value
  const pct = Math.round((numValue / max) * 100)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Condition badge ───

const CONDITION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  thriving: { bg: 'bg-green-900/50', text: 'text-green-400', label: '蓬勃' },
  content: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: '满足' },
  struggling: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', label: '挣扎' },
  desperate: { bg: 'bg-red-900/50', text: 'text-red-400', label: '绝望' },
  scheming: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: '谋划' },
  decaying: { bg: 'bg-gray-900/50', text: 'text-gray-400', label: '衰败' },
  isolated: { bg: 'bg-indigo-900/50', text: 'text-indigo-400', label: '孤立' },
  critical: { bg: 'bg-red-900/50', text: 'text-red-400', label: '危急' },
  breaking: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: '崩溃' },
  unhinged: { bg: 'bg-pink-900/50', text: 'text-pink-400', label: '疯狂' },
}

function ConditionBadge({ condition }: { condition: string }) {
  const style = CONDITION_STYLES[condition] ?? { bg: 'bg-slate-800', text: 'text-slate-400', label: condition }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">状态</span>
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    </div>
  )
}

// ─── Collapsible attribute group ───

type AttrDef = {
  label: string
  key: string
  value: number | undefined
  max?: number
  color: string
  invert?: boolean
}

function AttributeGroup({ title, attrs, defaultOpen = false, trends }: {
  title: string
  attrs: AttrDef[]
  defaultOpen?: boolean
  trends?: Record<string, 'rising' | 'stable' | 'falling'>
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-800/50"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <span className="text-xs text-slate-600">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2">
          {attrs.map(attr => (
            <AttrRow key={attr.key} attr={attr} trend={trends?.[attr.key]} />
          ))}
        </div>
      )}
    </div>
  )
}

function AttrRow({ attr, trend }: { attr: AttrDef; trend?: 'rising' | 'stable' | 'falling' }) {
  const val = attr.value ?? 0
  const max = attr.max ?? (isFinite(val) && val > 100 ? Math.ceil(val * 1.2) : 100)
  const pct = Math.min(100, Math.round((val / max) * 100))
  const trendIcon = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : ''
  const trendColor = trend === 'rising' ? 'text-green-500' : trend === 'falling' ? 'text-red-500' : ''
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs text-slate-500">{attr.label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${attr.color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-12 text-right text-xs font-medium ${attr.color}`}>{fmt2(val)}</span>
      {trendIcon && <span className={`text-xs ${trendColor}`}>{trendIcon}</span>}
    </div>
  )
}

// ─── Personality params bar ───

function PersonalityBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round((value / 100) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs text-slate-400">{value}</span>
    </div>
  )
}
