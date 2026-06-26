'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { WorldboxShell } from '@/ui/console/shell'
import type { WorldSnapshot } from '@/core/world'
import type { WorldMeta } from '@/core/world'
import { ArrowLeft } from 'lucide-react'

export default function WorldDetailPage() {
  const params = useParams()
  const router = useRouter()
  const worldId = params.id as string

  const [worldRecord, setWorldMeta] = React.useState<WorldMeta | null | undefined>(undefined)
  const [world, setWorld] = React.useState<WorldSnapshot | null>(null)
  const [snapshotMissing, setSnapshotMissing] = React.useState(false)

  React.useEffect(() => {
    // Fetch world data directly from server API
    fetch(`/api/sim/${worldId}`)
      .then(res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(data => {
        if (data?.world_snapshot) {
          const slice = data.world_snapshot as WorldSnapshot
          setWorldMeta({
            id: worldId,
            worldPrompt: (slice as any).config?.worldPrompt ?? '',
            title: slice.title,
            summary: slice.summary,
            tick: slice.tick,
            characterCount: (slice as any).characters?.length ?? 0,
            factionCount: (slice as any).factions?.length ?? 0,
            agentCount: slice.agents?.npcs?.length ?? 0,
            eventCount: (slice as any).events?.length ?? 0,
            lastSnapshotAt: new Date().toISOString(),
            storageVersion: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          setSnapshotMissing(false)
          setWorld(slice)
        } else {
          setWorldMeta(null)
          setSnapshotMissing(true)
          setWorld(null)
        }
      })
      .catch(() => {
        setWorldMeta(null)
        setSnapshotMissing(true)
        setWorld(null)
      })
  }, [worldId])

  if (worldRecord === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">加载中...</p>
      </main>
    )
  }

  if (worldRecord === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950">
        <p className="text-slate-300">世界不存在</p>
        <button
          onClick={() => router.push('/sim')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          返回世界列表
        </button>
      </main>
    )
  }

  if (!world) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950">
        <p className="text-slate-300">
          {snapshotMissing ? '世界快照丢失，请重新创建' : '加载世界中...'}
        </p>
        <button
          onClick={() => router.push('/sim')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          返回世界列表
        </button>
      </main>
    )
  }

  return <WorldboxShell worldId={worldId} initialWorld={world} />
}
