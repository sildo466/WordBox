'use client'

import React from 'react'
import Link from 'next/link'
import { listWorlds, deleteWorld } from '@/services/store'
import type { WorldMeta } from '@/core/world'
import { Plus, Trash2, Box, Clock, Users, Shield, ChevronRight, Swords } from 'lucide-react'

export default function WorldsPage() {
  const [worlds, setWorlds] = React.useState<WorldMeta[]>([])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    listWorlds().then(setWorlds).finally(() => setMounted(true))
  }, [])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('确定要删除这个世界吗？此操作不可撤销。')) return
    await deleteWorld(id)
    listWorlds().then(setWorlds)
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-950 p-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold text-slate-100">WordBox</h1>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Box className="h-7 w-7 text-cyan-400" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                WordBox
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              世界管理 · 选择一个世界进入，或创建新的
            </p>
          </div>
          <Link
            href="/sim/new"
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-cyan-500 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            <span>创建新世界</span>
          </Link>
        </div>

        {/* Content */}
        {worlds.length === 0 ? (
          <div className="mt-24 flex flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
              <Box className="h-8 w-8 text-slate-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-300">
              还没有世界
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              创建你的第一个世界，设定背景，然后观察它自行运转。
            </p>
            <Link
              href="/sim/new"
              className="mt-8 flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-cyan-500 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              <span>创建新世界</span>
            </Link>
          </div>
        ) : (
          /* Table-style list */
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_120px_60px] gap-4 border-b border-slate-800 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
              <span>世界</span>
              <span className="text-center">Tick</span>
              <span className="text-center">角色</span>
              <span className="text-center">势力</span>
              <span className="text-center">创建时间</span>
              <span></span>
            </div>

            {/* Table rows */}
            {worlds.map((world) => (
              <Link
                key={world.id}
                href={`/sim/${world.id}`}
                className="group grid grid-cols-[1fr_80px_80px_80px_120px_60px] items-center gap-4 border-b border-slate-800/50 px-5 py-4 transition-colors last:border-b-0 hover:bg-slate-800/30"
              >
                {/* World name + summary */}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                    {world.title || world.worldPrompt.slice(0, 40)}
                  </h3>
                  {(world.summary || world.title) && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {world.summary || world.worldPrompt.slice(0, 60)}
                    </p>
                  )}
                </div>

                {/* Tick */}
                <div className="text-center">
                  <span className="text-sm tabular-nums text-slate-400">
                    {world.tick ?? 0}
                  </span>
                </div>

                {/* Characters */}
                <div className="flex items-center justify-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-600" />
                  <span className="text-sm tabular-nums text-slate-400">
                    {world.characterCount ?? '—'}
                  </span>
                </div>

                {/* Factions */}
                <div className="flex items-center justify-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-slate-600" />
                  <span className="text-sm tabular-nums text-slate-400">
                    {world.factionCount ?? '—'}
                  </span>
                </div>

                {/* Created */}
                <div className="flex items-center justify-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-600" />
                  <time className="text-xs text-slate-500" dateTime={world.createdAt}>
                    {new Date(world.createdAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={(e) => handleDelete(world.id, e)}
                    className="rounded p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-950 hover:text-red-400 group-hover:opacity-100"
                    title="删除世界"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
