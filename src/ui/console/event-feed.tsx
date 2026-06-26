'use client'

import React from 'react'
import { Scroll, Filter, Star, MapPin, Sword, Handshake, Zap, AlertTriangle, BookOpen, MessageSquare } from 'lucide-react'
import type { SimEvent } from '@/core/sim/event'

type Props = {
  events: SimEvent[]
  onEventClick?: (event: SimEvent) => void
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  battle: Sword,
  negotiation: Handshake,
  disaster: AlertTriangle,
  discovery: BookOpen,
  god_command: Zap,
  rumor: MessageSquare,
}

const EVENT_COLORS: Record<string, string> = {
  battle: 'text-red-400 border-red-800',
  negotiation: 'text-blue-400 border-blue-800',
  disaster: 'text-orange-400 border-orange-800',
  discovery: 'text-yellow-400 border-yellow-800',
  god_command: 'text-purple-400 border-purple-800',
  assassination: 'text-red-500 border-red-900',
  rebellion: 'text-orange-500 border-orange-900',
  alliance: 'text-green-400 border-green-800',
  betrayal: 'text-red-400 border-red-800',
  rumor: 'text-slate-400 border-slate-700',
  other: 'text-slate-400 border-slate-700',
}

const ALL_TYPES = [
  'battle', 'negotiation', 'assassination', 'disaster', 'discovery',
  'trade', 'migration', 'rebellion', 'alliance', 'betrayal',
  'romance', 'ritual', 'rumor', 'god_command', 'other',
]

function ImportanceDots({ value }: { value: number }) {
  const filled = Math.round((Number.isFinite(value) ? value : 0) * 5)
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < filled ? 'bg-yellow-400' : 'bg-slate-700'}`}
        />
      ))}
    </span>
  )
}

export function EventLogPanel({ events, onEventClick }: Props) {
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null)
  const [minImportance, setMinImportance] = React.useState(0)
  const [showFilters, setShowFilters] = React.useState(false)

  const sorted = React.useMemo(() => {
    return [...events]
      .filter(e => !typeFilter || e.type === typeFilter)
      .filter(e => (e.importance ?? 0) >= minImportance)
      .sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0))
  }, [events, typeFilter, minImportance])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Scroll className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-200">事件日志</span>
        <span className="ml-auto rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {sorted.length}
        </span>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`rounded p-1 transition hover:bg-slate-700 ${showFilters ? 'text-blue-400' : 'text-slate-500'}`}
          title="筛选"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="border-b border-slate-700 bg-slate-900/50 px-3 py-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setTypeFilter(null)}
              className={`rounded px-2 py-0.5 text-xs transition ${!typeFilter ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              全部
            </button>
            {ALL_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className={`rounded px-2 py-0.5 text-xs transition ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Star className="h-3 w-3 text-yellow-400" />
            <span className="text-xs text-slate-400">重要度 ≥</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={minImportance}
              onChange={e => setMinImportance(parseFloat(e.target.value))}
              className="w-24 accent-yellow-400"
            />
            <span className="text-xs text-slate-300 w-6">{minImportance.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600">
            <Scroll className="h-8 w-8 mb-2" />
            <p className="text-sm">暂无事件</p>
            <p className="text-xs mt-1">运行 tick 以生成世界事件</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {sorted.map(event => {
              const Icon = EVENT_ICONS[event.type] ?? BookOpen
              const colors = EVENT_COLORS[event.type] ?? EVENT_COLORS.other
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-800/60 transition group"
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 shrink-0 rounded border p-1 ${colors}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-slate-200 truncate">{event.title ?? event.type}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-600 font-mono">t{event.tick}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{event.summary ?? '暂无摘要'}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <ImportanceDots value={event.importance ?? 0} />
                        {event.location_region_id && (
                          <span className="flex items-center gap-0.5 text-xs text-slate-600">
                            <MapPin className="h-2.5 w-2.5" />
                            <span className="truncate max-w-20">{event.location_region_id}</span>
                          </span>
                        )}
                        {(event.tags ?? []).slice(0, 2).map(tag => (
                          <span key={tag} className="rounded bg-slate-700/50 px-1 py-0.5 text-xs text-slate-500">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
