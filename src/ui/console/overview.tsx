'use client'

import React from 'react'
import { Globe, TrendingUp, AlertTriangle, Flag, Zap } from 'lucide-react'
import type { WorldSnapshot } from '@/core/world'
import { fmt2 } from '@/lib/format'

type Props = {
  world: WorldSnapshot
}

const MOOD_BADGE: Record<string, { label: string; cls: string }> = {
  calm:    { label: '平静', cls: 'bg-green-900/50 text-green-300 border-green-800' },
  tense:   { label: '紧张', cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  chaotic: { label: '混乱', cls: 'bg-red-900/50 text-red-300 border-red-800' },
  hopeful: { label: '希望', cls: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  grim:    { label: '阴郁', cls: 'bg-purple-900/50 text-purple-300 border-purple-800' },
}

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="text-right">
        <span className="text-xs font-medium text-slate-200">{value}</span>
        {sub && <span className="ml-1.5 text-xs text-slate-600">{sub}</span>}
      </div>
    </div>
  )
}

export function WorldOverviewPanel({ world }: Props) {
  const mood = (world as any).world_mood ?? 'calm'
  const moodBadge = MOOD_BADGE[mood] ?? MOOD_BADGE.calm

  const factions = ((world as any).organizations ?? world.factions ?? []) as any[]
  const characters = world.characters ?? []
  const events = (world as any).events ?? []
  const crises = (world as any).active_crises ?? []
  const godCommands = (world as any).god_commands ?? []

  const recentEvents = [...events]
    .sort((a: any, b: any) => (b.tick ?? 0) - (a.tick ?? 0))
    .slice(0, 5)

  const topFaction = factions.length > 0
    ? factions.reduce((best: any, f: any) =>
        (f.influence_score ?? 0) > (best.influence_score ?? 0) ? f : best
      , factions[0])
    : null

  const pendingCommands = godCommands.filter((c: any) => c.status === 'pending' || c.status === 'parsed')

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Globe className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-200">世界总览</span>
      </div>

      <div className="p-3 space-y-4">
        {/* World info */}
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">世界状态</h3>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1">
            <StatRow label="当前 Tick" value={world.tick ?? 0} />
            <StatRow label="基调" value={
              <span className={`rounded border px-1.5 py-0.5 text-xs ${moodBadge.cls}`}>
                {moodBadge.label}
              </span>
            } />
            <StatRow label="势力数" value={factions.length} />
            <StatRow label="角色数" value={characters.length} />
            <StatRow
              label="事件总数"
              value={events.length}
              sub={events.length > 0 ? `最新 t${events[events.length - 1]?.tick ?? 0}` : undefined}
            />
          </div>
        </div>

        {/* Active crises */}
        {crises.length > 0 && (
          <div>
            <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-red-500">
              <AlertTriangle className="h-3 w-3" />
              全局危机
            </h3>
            <div className="space-y-1">
              {crises.map((crisis: any) => (
                <div key={crisis.id} className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2">
                  <p className="text-xs font-medium text-red-300">{crisis.name}</p>
                  <p className="mt-0.5 text-xs text-red-400/70 line-clamp-2">{crisis.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dominant faction */}
        {topFaction && (
          <div>
            <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Flag className="h-3 w-3" />
              主导势力
            </h3>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">{topFaction.name}</span>
                <span className="text-xs text-slate-500">{topFaction.type ?? topFaction.category ?? ''}</span>
              </div>
              <div className="mt-1.5 flex gap-3">
                <div className="text-center">
                  <div className="text-xs font-bold text-yellow-400">
                    {fmt2(topFaction.influence_score > 1 ? topFaction.influence_score : (topFaction.influence_score ?? 0) * 100)}
                  </div>
                  <div className="text-xs text-slate-600">影响力</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-blue-400">
                    {fmt2((topFaction.cohesion ?? 0) * 100)}
                  </div>
                  <div className="text-xs text-slate-600">凝聚力</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending commands */}
        {pendingCommands.length > 0 && (
          <div>
            <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-purple-500">
              <Zap className="h-3 w-3" />
              待执行命令 ({pendingCommands.length})
            </h3>
            <div className="space-y-1">
              {pendingCommands.slice(0, 3).map((cmd: any) => (
                <div key={cmd.id} className="rounded-lg border border-purple-900/50 bg-purple-950/30 px-3 py-1.5">
                  <p className="text-xs text-purple-300 line-clamp-1">{cmd.raw_input}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent events */}
        {recentEvents.length > 0 && (
          <div>
            <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3 w-3" />
              近期事件
            </h3>
            <div className="space-y-1">
              {recentEvents.map((evt: any) => (
                <div key={evt.id} className="flex items-start gap-2 py-1">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-600">t{evt.tick}</span>
                  <p className="text-xs text-slate-400 line-clamp-1">{evt.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
