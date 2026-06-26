'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Globe, Flag, Users, Network } from 'lucide-react'
import type { WorldSnapshot } from '@/core/world'
import { OverviewTab } from '@/ui/console/dashboard/overview'
import { MapPanel } from '@/ui/console/dashboard/map'
import { FactionDetail } from '@/ui/console/dashboard/faction-card'
import { CharacterDetail } from '@/ui/console/dashboard/char-card'
import { RelationshipGraph } from '@/ui/console/dashboard/relations'

type TabKey = 'overview' | 'map' | 'factions' | 'characters' | 'relations'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '📊 总览', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'map', label: '🗺️ 地图', icon: <Globe className="h-4 w-4" /> },
  { key: 'factions', label: '⚔️ 势力', icon: <Flag className="h-4 w-4" /> },
  { key: 'characters', label: '👤 角色', icon: <Users className="h-4 w-4" /> },
  { key: 'relations', label: '🔗 关系', icon: <Network className="h-4 w-4" /> },
]

export default function DashboardPage({ params }: { params: { id: string } }) {
  const [world, setWorld] = React.useState<WorldSnapshot | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<TabKey>('overview')
  const [selectedFactionId, setSelectedFactionId] = React.useState<string | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const loadWorld = async () => {
      try {
        const res = await fetch(`/api/sim/${params.id}`)
        if (!res.ok) throw new Error('Failed to load world')
        const data = await res.json()
        setWorld(data.world_snapshot ?? data)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    loadWorld()
  }, [params.id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        加载中...
      </div>
    )
  }

  if (error || !world) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-400">
        <p>加载失败: {error || '世界不存在'}</p>
        <Link href="/sim" className="text-blue-400 hover:underline">返回世界列表</Link>
      </div>
    )
  }

  const orgs = ((world as any).organizations ?? (world as any).factions ?? []) as Record<string, any>[]
  const chars = ((world as any).characters ?? []) as Record<string, any>[]

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <Link
          href={`/sim/${params.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          返回控制台
        </Link>
        <div className="mx-2 h-4 w-px bg-slate-700" />
        <span className="text-sm font-semibold text-slate-200">{world.title ?? '未命名世界'}</span>
        <span className="text-xs text-slate-600">Tick {world.tick ?? 0}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
          {(world as any).world_mood ?? 'calm'}
        </span>
      </header>

      {/* Tab nav */}
      <nav className="flex shrink-0 border-b border-slate-800 bg-slate-900/60">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === tab.key
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'overview' && <OverviewTab world={world} />}
        {activeTab === 'map' && <MapPanel world={world} />}
        {activeTab === 'factions' && (
          <FactionDetail
            world={world}
            selectedFactionId={selectedFactionId}
            onSelectFaction={setSelectedFactionId}
          />
        )}
        {activeTab === 'characters' && (
          <CharacterDetail
            world={world}
            selectedCharacterId={selectedCharacterId}
            onSelectCharacter={setSelectedCharacterId}
          />
        )}
        {activeTab === 'relations' && <RelationshipGraph world={world} />}
      </main>
    </div>
  )
}
