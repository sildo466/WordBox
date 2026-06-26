'use client'

import React from 'react'
import { Activity, Flag, Globe2, MapPin, ScrollText, Shield, Sparkles, User, X } from 'lucide-react'
import type { WorldSnapshot } from '@/core/world'
import { fmt2 } from '@/lib/format'
import type { SimEvent } from '@/core/sim/event'

export type EntitySelection = {
  type: 'world' | 'character' | 'organization' | 'region'
  id: string
}

type Props = {
  world: WorldSnapshot
  events: SimEvent[]
  selection: EntitySelection | null
  onSelect: (selection: EntitySelection) => void
  onClear?: () => void
}

type EntityOption = EntitySelection & {
  name: string
  description?: string
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

function normalizeEntity(value: unknown): Record<string, any> {
  if (value && typeof value === 'object') return value as Record<string, any>
  return { id: String(value), name: String(value) }
}

function getRegions(world: WorldSnapshot): Record<string, any>[] {
  const directRegions = (world as any).regions
  return Array.isArray(directRegions) ? directRegions.map(normalizeEntity) : []
}

function getOrganizations(world: WorldSnapshot): Record<string, any>[] {
  const organizations = (world as any).organizations
  return Array.isArray(organizations) ? organizations.map(normalizeEntity) : (world.factions ?? []).map(normalizeEntity)
}

function getCharacters(world: WorldSnapshot): Record<string, any>[] {
  const characters = (world as any).characters
  return Array.isArray(characters) ? characters.map(normalizeEntity) : []
}

function getEntityOptions(world: WorldSnapshot): EntityOption[] {
  const worldOption: EntityOption = {
    type: 'world',
    id: world.world_id,
    name: world.title ?? '世界本身',
    description: world.summary ?? world.environment?.description,
  }

  const regions = getRegions(world).map(region => ({
    type: 'region' as const,
    id: String(region.id ?? region.name),
    name: String(region.name ?? region.id ?? '未命名地区'),
    description: region.description,
  }))

  const organizations = getOrganizations(world).map(organization => ({
    type: 'organization' as const,
    id: String(organization.id ?? organization.name),
    name: String(organization.name ?? organization.id ?? '未命名组织'),
    description: organization.description ?? organization.ideology ?? organization.history,
  }))

  const characters = getCharacters(world).map(character => ({
    type: 'character' as const,
    id: String(character.id ?? character.name),
    name: String(character.name ?? character.id ?? '未命名角色'),
    description: character.description ?? character.title ?? character.backstory,
  }))

  return [worldOption, ...regions, ...organizations, ...characters]
}

function findEntity(world: WorldSnapshot, selection: EntitySelection | null): Record<string, any> | null {
  if (!selection) return null
  if (selection.type === 'world') return world as any

  const collections: Record<EntitySelection['type'], Record<string, any>[]> = {
    world: [world as any],
    character: getCharacters(world),
    organization: getOrganizations(world),
    region: getRegions(world),
  }

  return collections[selection.type].find(entity => String(entity.id ?? entity.name) === selection.id) ?? null
}

function getEntityName(world: WorldSnapshot, selection: EntitySelection | null, entity: Record<string, any> | null): string {
  if (!selection) return '未选择实体'
  if (selection.type === 'world') return world.title ?? '世界本身'
  return String(entity?.name ?? entity?.id ?? selection.id)
}

function getEntitySubtitle(selection: EntitySelection | null, entity: Record<string, any> | null): string {
  if (!selection) return '点击角色、组织或地区查看详情'
  if (selection.type === 'world') return '全局世界状态'
  if (selection.type === 'character') return entity?.title || entity?.story_role || entity?.status || '角色'
  if (selection.type === 'organization') return entity?.type || entity?.category || entity?.alignment || '组织'
  return entity?.terrain || entity?.area_size || '地区'
}

function getIcon(type: EntitySelection['type']) {
  if (type === 'character') return User
  if (type === 'organization') return Flag
  if (type === 'region') return MapPin
  return Globe2
}

/**
 * 有上限属性：显示为 0-100 整数
 */
function fmtAttr(value: unknown, _capped?: boolean): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n)) return '?'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n < 10 ? 1 : 0)
}

/**
 * 无上限属性：显示原始数值，大数用 k 缩写
 */
function fmtNum(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n)) return '?'
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n < 10 ? 1 : 0)
}

function relatedEventsFor(selection: EntitySelection | null, events: SimEvent[]): SimEvent[] {
  if (!selection) return []
  if (selection.type === 'world') {
    return [...events].sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0)).slice(0, 6)
  }

  return events
    .filter(event => {
      const actorIds = Array.isArray(event.actor_ids) ? event.actor_ids : []
      const targetIds = Array.isArray(event.target_ids) ? event.target_ids : []
      return actorIds.includes(selection.id)
        || targetIds.includes(selection.id)
        || event.location_region_id === selection.id
        || (Array.isArray(event.tags) && event.tags.includes(selection.id))
    })
    .sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0))
    .slice(0, 6)
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-200">{value}</div>
    </div>
  )
}

function TagList({ values }: { values: unknown }) {
  const list = Array.isArray(values) ? values.filter(Boolean).slice(0, 8) : []
  if (list.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {list.map(value => (
        <span key={String(value)} className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {String(value)}
        </span>
      ))}
    </div>
  )
}

function EntityDetails({ world, selection, entity }: { world: WorldSnapshot; selection: EntitySelection; entity: Record<string, any> | null }) {
  const data = asRecord(entity)

  if (selection.type === 'world') {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-slate-400">{world.environment?.description || world.summary || '暂无世界背景。'}</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Tick" value={world.tick ?? 0} />
          <Stat label="世界基调" value={(world as any).world_mood ?? 'calm'} />
          <Stat label="角色" value={getCharacters(world).length} />
          <Stat label="组织" value={getOrganizations(world).length} />
        </div>
      </div>
    )
  }

  if (selection.type === 'character') {
    const condition = data.condition ?? '?'
    const CONDITION_BADGE: Record<string, { label: string; cls: string }> = {
      thriving: { label: '得意', cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
      content: { label: '满足', cls: 'bg-green-900/50 text-green-300 border-green-800' },
      struggling: { label: '苦撑', cls: 'bg-orange-900/50 text-orange-300 border-orange-800' },
      desperate: { label: '绝望', cls: 'bg-red-900/50 text-red-300 border-red-800' },
      scheming: { label: '密谋', cls: 'bg-purple-900/50 text-purple-300 border-purple-800' },
      decaying: { label: '衰老', cls: 'bg-gray-900/50 text-gray-300 border-gray-800' },
      isolated: { label: '孤立', cls: 'bg-slate-900/50 text-slate-300 border-slate-800' },
      critical: { label: '垂危', cls: 'bg-red-900/50 text-red-300 border-red-800' },
      breaking: { label: '崩溃', cls: 'bg-red-900/50 text-red-300 border-red-800' },
      unhinged: { label: '失控', cls: 'bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-800' },
    }
    const badge = CONDITION_BADGE[condition]

    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-slate-400">{data.description || data.backstory || data.appearance || '暂无角色描述。'}</p>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="状态" value={data.status ?? 'alive'} />
          <Stat label="位置" value={data.location_region_id ?? '未知'} />
          <Stat label="组织" value={data.organization_id ?? data.faction_id ?? '无'} />
          {badge && <Stat label="状态" value={<span className={`rounded border px-1.5 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>} />}
        </div>

        {/* 身体 */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">身体</h4>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="生命力" value={fmtAttr(data.vitality, true)} />
            <Stat label="健康" value={fmtAttr(data.health, true)} />
            <Stat label="体力" value={fmtAttr(data.energy, true)} />
            <Stat label="压力" value={fmtAttr(data.stress, true)} />
            <Stat label="衰老" value={fmtNum(data.aging)} />
          </div>
        </div>

        {/* 精神 */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">精神</h4>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="士气" value={fmtAttr(data.morale, true)} />
            <Stat label="集中力" value={fmtAttr(data.focus, true)} />
            <Stat label="理智" value={fmtAttr(data.sanity, true)} />
          </div>
        </div>

        {/* 社会 */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">社会</h4>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="影响力" value={fmtNum(data.influence)} />
            <Stat label="声望" value={fmtNum(data.reputation)} />
            <Stat label="组织地位" value={fmtNum(data.standing)} />
            <Stat label="忠诚" value={fmtAttr(data.loyalty, true)} />
          </div>
        </div>

        {/* 资源 */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">资源</h4>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="财富" value={fmtNum(data.wealth)} />
            <Stat label="兵力" value={fmtNum(data.army)} />
            <Stat label="追随者" value={fmtNum(data.retainers)} />
            <Stat label="秘密" value={fmtNum(data.secrets)} />
          </div>
        </div>

        {/* 能力 */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">能力</h4>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="武力" value={fmtNum(data.martial)} />
            <Stat label="谋略" value={fmtNum(data.cunning)} />
            <Stat label="魅力" value={fmtNum(data.charisma)} />
            <Stat label="学识" value={fmtNum(data.lore)} />
          </div>
        </div>

        {/* 关系 */}
        {Array.isArray(data.relations) && data.relations.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">关系</h4>
            <div className="space-y-1">
              {data.relations.slice(0, 5).map((rel: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5">
                  <span className="text-xs text-slate-300">{rel.character_id ?? rel.target ?? '?'}</span>
                  <span className="text-xs text-slate-500">{rel.type} {rel.strength != null ? `(${fmtNum(rel.strength)})` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <TagList values={data.personality ?? data.core_beliefs ?? data.tags} />
        {(data.current_task || data.last_action_summary) && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Activity className="h-3 w-3" />当前行动
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              {data.current_task?.description ?? data.last_action_summary}
            </p>
          </div>
        )}
      </div>
    )
  }

  if (selection.type === 'organization') {
    // Count members: from member_ids, or by matching characters' faction_id
    const memberCount = Array.isArray(data.member_ids) && data.member_ids.length > 0
      ? data.member_ids.length
      : getCharacters(world).filter(c =>
          c.faction_id === data.id || c.faction_id === data.name ||
          c.faction_allegiance === data.name
        ).length

    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-slate-400">{data.description || data.ideology || data.history || '暂无组织描述。'}</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="影响力" value={fmtNum(data.influence_score)} />
          <Stat label="军事力量" value={fmtNum(data.military_strength ?? 0)} />
          <Stat label="经济实力" value={fmtNum(data.economic_power ?? 0)} />
          <Stat label="凝聚力" value={fmtNum(data.cohesion)} />
          <Stat label="声望" value={fmtNum(data.public_reputation ?? data.public_perception ?? 0)} />
          <Stat label="资源" value={Array.isArray(data.resources) ? data.resources.length : data.resources ?? 0} />
          <Stat label="成员" value={memberCount} />
          <Stat label="状态" value={data.status ?? 'stable'} />
        </div>
        <TagList values={data.traits ?? data.tags} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-400">{data.description || data.culture_notes || '暂无地区描述。'}</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="地形" value={data.terrain ?? '未知'} />
        <Stat label="人口" value={data.population ?? '未知'} />
        <Stat label="危险" value={fmtNum(data.danger_level)} />
        <Stat label="繁荣" value={fmtNum(data.prosperity)} />
      </div>
      <TagList values={data.notable_locations ?? (Array.isArray(data.resources) ? data.resources.map((resource: any) => resource.type) : [])} />
    </div>
  )
}

export function EntityInspector({ world, events, selection, onSelect, onClear }: Props) {
  const entity = findEntity(world, selection)
  const options = getEntityOptions(world)
  const currentSelection = selection ?? options[0]
  const selectedEntity = selection ? entity : world as any
  const Icon = getIcon(currentSelection.type)
  const relatedEvents = relatedEventsFor(currentSelection, events)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Shield className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-medium text-slate-200">实体详情</span>
        {onClear && selection && (
          <button onClick={onClear} className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="清除选择">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="border-b border-slate-800 p-3">
        <select
          value={`${currentSelection.type}:${currentSelection.id}`}
          onChange={event => {
            const [type, ...idParts] = event.target.value.split(':')
            onSelect({ type: type as EntitySelection['type'], id: idParts.join(':') })
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
        >
          {options.map(option => (
            <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
              {option.type === 'world' ? '世界' : option.type === 'character' ? '角色' : option.type === 'organization' ? '组织' : '地区'} · {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-cyan-900 bg-cyan-950/40 p-2 text-cyan-300">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-slate-100">
                {getEntityName(world, currentSelection, selectedEntity)}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{getEntitySubtitle(currentSelection, selectedEntity)}</p>
            </div>
          </div>
        </div>

        <EntityDetails world={world} selection={currentSelection} entity={selectedEntity} />

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <ScrollText className="h-3 w-3" />相关事件
          </h3>
          {relatedEvents.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-4 text-center text-xs text-slate-600">
              暂无相关事件
            </p>
          ) : (
            <div className="space-y-2">
              {relatedEvents.map(event => (
                <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 shrink-0 text-yellow-500" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">{event.title}</p>
                    <span className="font-mono text-xs text-slate-600">t{event.tick}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{event.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
