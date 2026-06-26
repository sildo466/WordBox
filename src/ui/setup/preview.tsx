'use client'

import React from 'react'
import { MapPin, Flag, Users, ArrowRight, RefreshCw } from 'lucide-react'

type Props = {
  world: any // WorldSnapshot preview data
  onConfirm: () => void
  onRegenerate: () => void
  isCreating: boolean
}

export function WorldPreview({ world, onConfirm, onRegenerate, isCreating }: Props) {
  const w = world as any
  const regions: any[] = w.regions ?? []
  const orgs: any[] = w.organizations ?? w.factions ?? []
  const chars: any[] = w.characters ?? []

  return (
    <div className="space-y-6">
      {/* World summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-bold text-slate-100">{w.title ?? '预览'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {w.environment?.description ?? w.summary ?? '暂无描述'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
          <div className="text-xl font-bold text-cyan-400">{regions.length}</div>
          <div className="text-xs text-slate-600">地区</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
          <div className="text-xl font-bold text-green-400">{orgs.length}</div>
          <div className="text-xs text-slate-600">势力</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
          <div className="text-xl font-bold text-yellow-400">{chars.length}</div>
          <div className="text-xs text-slate-600">角色</div>
        </div>
      </div>

      {/* Regions preview */}
      {regions.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <MapPin className="h-3.5 w-3.5" />地区
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {regions.map((r: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-medium text-slate-200">{r.name ?? r.id}</div>
                <div className="mt-1 text-xs text-slate-500">{r.description?.slice(0, 60)}...</div>
                <div className="mt-1 flex gap-2 text-xs text-slate-600">
                  <span>{r.terrain}</span>
                  <span>危险度 {r.danger_level}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Organizations preview */}
      {orgs.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Flag className="h-3.5 w-3.5" />势力
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {orgs.map((o: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-medium text-slate-200">{o.name ?? o.id}</div>
                <div className="mt-1 text-xs text-slate-500">{o.description?.slice(0, 60) || o.ideology?.slice(0, 60)}...</div>
                <div className="mt-1 flex gap-2 text-xs text-slate-600">
                  <span>影响 {o.influence_score}</span>
                  <span>军事 {o.military_strength}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Characters preview */}
      {chars.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Users className="h-3.5 w-3.5" />角色
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chars.map((c: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-medium text-slate-200">{c.name ?? c.id}</div>
                {c.title && <div className="text-xs text-slate-500">{c.title}</div>}
                <div className="mt-1 text-xs text-slate-600">
                  {c.personality?.slice(0, 3)?.join('、') || c.description?.slice(0, 40)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRegenerate}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-700"
          disabled={isCreating}
        >
          <RefreshCw className="h-4 w-4" />
          重新生成
        </button>
        <button
          onClick={onConfirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
          disabled={isCreating}
        >
          {isCreating ? '创建中...' : '确认创建'}
          {!isCreating && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
