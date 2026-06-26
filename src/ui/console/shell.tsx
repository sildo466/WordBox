'use client'

import React from 'react'
import Link from 'next/link'
import { BarChart3, Flag, Globe, Info, MapPin, Scroll, Sparkles, User, Users, X, Zap } from 'lucide-react'
import { fmt2 } from '@/lib/format'
import type { WorldSnapshot } from '@/core/world'
import type { SimEvent } from '@/core/sim/event'
import { EntityInspector, type EntitySelection } from './inspector'
import { EventLogPanel } from './event-feed'
import { GodCommandPanel } from './command-input'
import { TickControlBar } from './tick-bar'
import { WorldOverviewPanel } from './overview'

type Props = {
  worldId: string
  initialWorld: WorldSnapshot
}

type MobilePanelKey = 'overview' | 'events' | 'commands' | 'inspector'

function normalizeEvents(rawEvents: unknown): SimEvent[] {
  if (!Array.isArray(rawEvents)) return []

  return rawEvents.map((event, index) => {
    const item = event && typeof event === 'object' ? event as Record<string, any> : {}
    return {
      id: String(item.id ?? `event-${index}`),
      type: item.type ?? 'other',
      title: item.title ?? item.payload?.title ?? item.type ?? '未命名事件',
      summary: item.summary ?? item.payload?.summary ?? item.payload?.description ?? '暂无摘要。',
      detail: item.detail ?? item.payload?.detail ?? '',
      actor_ids: Array.isArray(item.actor_ids) ? item.actor_ids : [],
      target_ids: Array.isArray(item.target_ids) ? item.target_ids : [],
      location_region_id: item.location_region_id ?? null,
      effects: Array.isArray(item.effects) ? item.effects : [],
      visibility: item.visibility ?? 'public',
      importance: typeof item.importance === 'number' ? item.importance : 0.4,
      tick: typeof item.tick === 'number' ? item.tick : Number(item.timestamp ?? 0) || 0,
      tags: Array.isArray(item.tags) ? item.tags : [],
      linked_event_ids: Array.isArray(item.linked_event_ids) ? item.linked_event_ids : [],
      source: item.source ?? 'world_director',
    } as SimEvent
  })
}

function normalizeEntity(value: unknown): Record<string, any> {
  if (value && typeof value === 'object') return value as Record<string, any>
  return { id: String(value), name: String(value) }
}

function getRegions(world: WorldSnapshot): Record<string, any>[] {
  const regions = (world as any).regions
  return Array.isArray(regions) ? regions.map(normalizeEntity) : []
}

function getOrganizations(world: WorldSnapshot): Record<string, any>[] {
  const organizations = (world as any).organizations
  return Array.isArray(organizations) ? organizations.map(normalizeEntity) : (world.factions ?? []).map(normalizeEntity)
}

function getCharacters(world: WorldSnapshot): Record<string, any>[] {
  const characters = (world as any).characters
  if (Array.isArray(characters) && characters.length > 0) {
    return characters.map(normalizeEntity)
  }
  // Fallback: extract from agents.npcs
  const npcs = world.agents?.npcs
  if (Array.isArray(npcs) && npcs.length > 0) {
    return npcs.map((npc: any) => normalizeEntity({
      id: npc.id ?? npc.genetics?.seed ?? npc.identity?.name,
      name: npc.name ?? npc.identity?.name ?? '未知',
      description: npc.philosophy ?? npc.core_belief ?? npc.occupation ?? '',
      faction_id: npc.faction_id,
      initial_life_status: npc.life_status,
      initial_goals: npc.goals,
    }))
  }
  return []
}

export function WorldboxShell({ worldId, initialWorld }: Props) {
  const [world, setWorld] = React.useState<WorldSnapshot>(initialWorld)
  const [isTicking, setIsTicking] = React.useState(false)
  const [isAutoRunning, setIsAutoRunning] = React.useState(false)
  const [isSubmittingCommand, setIsSubmittingCommand] = React.useState(false)
  const [activeMobilePanel, setActiveMobilePanel] = React.useState<MobilePanelKey>('events')
  const [selectedEvent, setSelectedEvent] = React.useState<SimEvent | null>(null)
  const [selectedEntity, setSelectedEntity] = React.useState<EntitySelection | null>({
    type: 'world',
    id: initialWorld.world_id,
  })
  const [tickNarrative, setTickNarrative] = React.useState('')
  const [statusMessage, setStatusMessage] = React.useState('')
  const autoRunRef = React.useRef(false)

  const events = React.useMemo(() => normalizeEvents((world as any).events), [world])

  const persistWorld = React.useCallback((nextWorld: WorldSnapshot) => {
    setWorld(nextWorld)
    // Server-side persistence already handled by the API endpoints (sim-tick, command)
  }, [])

  const runTick = React.useCallback(async () => {
    if (isTicking) return
    setIsTicking(true)
    setStatusMessage('世界正在推进...')
    try {
      const res = await fetch(`/api/sim/${worldId}/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world }),
      })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      persistWorld(data.world)
      setTickNarrative(data.tick_narrative ?? '')
      setStatusMessage(`Tick ${data.world?.tick ?? (world.tick ?? 0) + 1} 完成`)
    } catch (error) {
      console.error('Tick failed:', error)
      setStatusMessage('推进失败，请检查服务端日志')
    } finally {
      setIsTicking(false)
    }
  }, [isTicking, persistWorld, world, worldId])

  React.useEffect(() => {
    autoRunRef.current = isAutoRunning
  }, [isAutoRunning])

  React.useEffect(() => {
    if (!isAutoRunning) return

    const timer = setInterval(async () => {
      if (!autoRunRef.current || isTicking) return
      await runTick()
    }, 4000)

    return () => clearInterval(timer)
  }, [isAutoRunning, isTicking, runTick])

  const handleCommand = React.useCallback(async (raw_input: string) => {
    setIsSubmittingCommand(true)
    setStatusMessage('命令正在解析并执行...')
    try {
      const res = await fetch(`/api/sim/${worldId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world, raw_input }),
      })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      persistWorld(data.world)
      setTickNarrative(data.tick_narrative ?? data.command?.feedback ?? '')
      setStatusMessage(data.command?.feedback || '命令已写入世界')
      setActiveMobilePanel('events')
    } catch (error) {
      console.error('Command failed:', error)
      setStatusMessage('命令失败，请检查服务端日志')
    } finally {
      setIsSubmittingCommand(false)
    }
  }, [persistWorld, world, worldId])

  const handleSelectEntity = React.useCallback((selection: EntitySelection) => {
    setSelectedEntity(selection)
    setSelectedEvent(null)
    setActiveMobilePanel('inspector')
  }, [])

  const mobilePanels = [
    { key: 'overview' as const, label: '总览', Icon: Globe },
    { key: 'events' as const, label: '事件', Icon: Scroll },
    { key: 'commands' as const, label: '命令', Icon: Zap },
    { key: 'inspector' as const, label: '实体', Icon: User },
  ]

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex shrink-0 flex-col gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 lg:flex-row lg:items-center lg:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-5 w-5 shrink-0 text-blue-400" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{world.title ?? '未命名世界'}</div>
            <div className="truncate text-xs text-slate-600">文字 Worldbox · 上帝视角控制台</div>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-3 lg:ml-auto lg:max-w-xl">
          {statusMessage && <p className="hidden flex-1 truncate text-xs text-slate-500 lg:block">{statusMessage}</p>}
          <Link
            href={`/sim/${worldId}/dashboard`}
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 transition hover:border-blue-600 hover:text-blue-400 lg:flex"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            数据看板
          </Link>
          <div className="w-full lg:w-auto lg:min-w-[380px]">
            <TickControlBar
              tick={world.tick ?? 0}
              era_label={`第${world.tick ?? 0}轮`}
              world_mood={(world as any).world_mood ?? 'calm'}
              isRunning={isAutoRunning}
              isTicking={isTicking}
              onTick={runTick}
              onToggleAuto={() => setIsAutoRunning(value => !value)}
            />
          </div>
        </div>
      </header>

      {tickNarrative && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-4 py-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <p className="flex-1 truncate text-xs italic text-slate-400">{tickNarrative}</p>
          <button onClick={() => setTickNarrative('')} className="shrink-0 text-slate-600 hover:text-slate-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="hidden min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-900">
          <div className="min-h-0 flex-1 border-b border-slate-800">
            <WorldOverviewPanel world={world} />
          </div>
          <div className="min-h-0 flex-1">
            <GodCommandPanel world={world} onCommand={handleCommand} isSubmitting={isSubmittingCommand} />
          </div>
        </aside>

        <main className="min-h-0 overflow-hidden">
          {selectedEvent ? (
            <EventDetailView
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onSelectEntity={handleSelectEntity}
            />
          ) : (
            <WorldStageView
              world={world}
              events={events}
              onEventClick={setSelectedEvent}
              onSelectEntity={handleSelectEntity}
            />
          )}
        </main>

        <aside className="grid min-h-0 grid-rows-2 border-l border-slate-800 bg-slate-900">
          <div className="min-h-0 border-b border-slate-800">
            <EventLogPanel events={events} onEventClick={setSelectedEvent} />
          </div>
          <div className="min-h-0">
            <EntityInspector
              world={world}
              events={events}
              selection={selectedEntity}
              onSelect={handleSelectEntity}
              onClear={() => setSelectedEntity({ type: 'world', id: world.world_id })}
            />
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
        <main className="min-h-0 flex-1 overflow-hidden">
          {selectedEvent ? (
            <EventDetailView
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onSelectEntity={handleSelectEntity}
            />
          ) : (
            <WorldStageView
              world={world}
              events={events}
              onEventClick={setSelectedEvent}
              onSelectEntity={handleSelectEntity}
            />
          )}
        </main>

        <section className="max-h-[46vh] min-h-[260px] border-t border-slate-800 bg-slate-900">
          {activeMobilePanel === 'overview' && <WorldOverviewPanel world={world} />}
          {activeMobilePanel === 'events' && <EventLogPanel events={events} onEventClick={setSelectedEvent} />}
          {activeMobilePanel === 'commands' && (
            <GodCommandPanel world={world} onCommand={handleCommand} isSubmitting={isSubmittingCommand} />
          )}
          {activeMobilePanel === 'inspector' && (
            <EntityInspector
              world={world}
              events={events}
              selection={selectedEntity}
              onSelect={handleSelectEntity}
              onClear={() => setSelectedEntity({ type: 'world', id: world.world_id })}
            />
          )}
        </section>

        <nav className="flex shrink-0 border-t border-slate-800 bg-slate-900">
          {mobilePanels.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveMobilePanel(key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition ${
                activeMobilePanel === key ? 'text-blue-400' : 'text-slate-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function EventDetailView({
  event,
  onClose,
  onSelectEntity,
}: {
  event: SimEvent
  onClose: () => void
  onSelectEntity: (selection: EntitySelection) => void
}) {
  const actorIds = Array.isArray(event.actor_ids) ? event.actor_ids : []
  const targetIds = Array.isArray(event.target_ids) ? event.target_ids : []
  const effects = Array.isArray(event.effects) ? event.effects : []
  const tags = Array.isArray(event.tags) ? event.tags : []
  const targetTypes = new Map(effects.map(effect => [effect.target_id, effect.target_type]))

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 md:p-6">
      <button
        onClick={onClose}
        className="mb-4 flex items-center gap-1.5 self-start text-sm text-slate-500 transition hover:text-slate-300"
      >
        <X className="h-4 w-4" />
        返回世界视图
      </button>

      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {event.type}
            </span>
            <span className="font-mono text-xs text-slate-600">Tick {event.tick}</span>
            <span className="ml-auto text-xs text-yellow-400">重要度 {((event.importance ?? 0) * 100).toFixed(2)}%</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">{event.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{event.summary}</p>
          {event.detail && <p className="mt-3 text-sm leading-relaxed text-slate-400">{event.detail}</p>}
        </div>

        {(actorIds.length > 0 || targetIds.length > 0 || event.location_region_id) && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">相关实体</h3>
            <div className="flex flex-wrap gap-2">
              {actorIds.map(id => (
                <button key={`actor-${id}`} onClick={() => onSelectEntity({ type: 'character', id })} className="rounded border border-blue-900 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
                  行动者 · {id}
                </button>
              ))}
              {targetIds.map(id => {
                const targetType = targetTypes.get(id)
                const selectionType = targetType === 'character' || targetType === 'organization' || targetType === 'region' ? targetType : 'organization'
                return (
                <button key={`target-${id}`} onClick={() => onSelectEntity({ type: selectionType, id })} className="rounded border border-purple-900 bg-purple-950/40 px-2 py-1 text-xs text-purple-300">
                  目标 · {id}
                </button>
                )
              })}
              {event.location_region_id && (
                <button onClick={() => onSelectEntity({ type: 'region', id: event.location_region_id! })} className="rounded border border-cyan-900 bg-cyan-950/40 px-2 py-1 text-xs text-cyan-300">
                  地区 · {event.location_region_id}
                </button>
              )}
            </div>
          </div>
        )}

        {effects.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">影响</h3>
            <div className="space-y-2">
              {effects.map((effect, index) => (
                <div key={index} className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <p className="text-xs text-slate-300">{effect.description}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{effect.target_type} · {effect.target_id} · {effect.field}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <span key={tag} className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-600">{label}</div>
    </div>
  )
}

function EntityCard({
  type,
  entity,
  icon,
  onSelect,
}: {
  type: EntitySelection['type']
  entity: Record<string, any>
  icon: React.ReactNode
  onSelect: (selection: EntitySelection) => void
}) {
  const id = String(entity.id ?? entity.name)
  const name = String(entity.name ?? entity.id ?? '未命名')
  const description = entity.description ?? entity.ideology ?? entity.history ?? entity.title ?? entity.backstory ?? entity.terrain ?? ''

  return (
    <button
      onClick={() => onSelect({ type, id })}
      className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-cyan-800 hover:bg-slate-800/80"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-slate-500">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-200">{name}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{description || '点击查看详情'}</p>
        </div>
      </div>
    </button>
  )
}

function WorldStageView({
  world,
  events,
  onEventClick,
  onSelectEntity,
}: {
  world: WorldSnapshot
  events: SimEvent[]
  onEventClick: (event: SimEvent) => void
  onSelectEntity: (selection: EntitySelection) => void
}) {
  const regions = getRegions(world)
  const organizations = getOrganizations(world)
  const characters = getCharacters(world)
  const topEvents = [...events]
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || (b.tick ?? 0) - (a.tick ?? 0))
    .slice(0, 6)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))] p-5 shadow-2xl shadow-slate-950/50">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-300">
                <Sparkles className="h-3.5 w-3.5" />世界沙盘
              </div>
              <h1 className="text-2xl font-bold text-slate-100">{world.title ?? '未命名世界'}</h1>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-400">
                {world.environment?.description || world.summary || '这个世界尚未写入背景。'}
              </p>
            </div>
            <button
              onClick={() => onSelectEntity({ type: 'world', id: world.world_id })}
              className="rounded-lg border border-blue-900 bg-blue-950/40 px-3 py-2 text-xs text-blue-200 transition hover:bg-blue-900/50"
            >
              查看世界实体
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard label="Tick" value={world.tick ?? 0} color="text-blue-400" />
          <MetricCard label="地区" value={regions.length} color="text-cyan-400" />
          <MetricCard label="组织" value={organizations.length} color="text-green-400" />
          <MetricCard label="角色" value={characters.length} color="text-yellow-400" />
          <MetricCard label="事件" value={events.length} color="text-purple-400" />
        </div>

        {regions.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <MapPin className="h-3.5 w-3.5" />地区
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {regions.slice(0, 6).map(region => (
                <EntityCard key={String(region.id ?? region.name)} type="region" entity={region} icon={<MapPin className="h-4 w-4" />} onSelect={onSelectEntity} />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Flag className="h-3.5 w-3.5" />主要组织
            </h2>
            {organizations.length === 0 ? (
              <EmptyBlock icon={<Flag className="h-7 w-7" />} text="暂无组织数据" />
            ) : (
              <div className="space-y-2">
                {organizations.slice(0, 5).map(organization => (
                  <EntityCard key={String(organization.id ?? organization.name)} type="organization" entity={organization} icon={<Flag className="h-4 w-4" />} onSelect={onSelectEntity} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Users className="h-3.5 w-3.5" />关键角色
            </h2>
            {characters.length === 0 ? (
              <EmptyBlock icon={<Users className="h-7 w-7" />} text="暂无角色数据" />
            ) : (
              <div className="space-y-2">
                {characters.slice(0, 5).map(character => (
                  <EntityCard key={String(character.id ?? character.name)} type="character" entity={character} icon={<User className="h-4 w-4" />} onSelect={onSelectEntity} />
                ))}
              </div>
            )}
          </section>
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Scroll className="h-3.5 w-3.5" />重要事件
          </h2>
          {topEvents.length === 0 ? (
            <EmptyBlock icon={<Globe className="h-10 w-10" />} text="世界静待开始：点击「单步」推进 tick，或开启「自动」让世界自行运转" />
          ) : (
            <div className="space-y-2">
              {topEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-slate-600 hover:bg-slate-800/80"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-200">{event.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-xs text-slate-600">t{event.tick}</span>
                      </div>
                      <p className="line-clamp-2 text-xs text-slate-400">{event.summary}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function EmptyBlock({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-slate-700">
      {icon}
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  )
}
