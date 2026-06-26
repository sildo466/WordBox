import type { WorldSnapshot } from '@/core/world'
import type { SimEvent, SimEventEffect } from '@/core/sim/event'

type ConsequenceResult = {
  world: WorldSnapshot
  applied_effects: number
  summary: string
}

const FIELD_NORMALIZATION: Record<string, string> = {
  influence: 'influence_score',
  influence_score: 'influence_score',
  military: 'military_strength',
  military_strength: 'military_strength',
  economic: 'economic_power',
  economic_power: 'economic_power',
  cohesion: 'cohesion',
  resources: 'resources',
  reputation: 'public_reputation',
  public_reputation: 'public_reputation',
  public_perception: 'public_perception',
  morale: 'morale',
  vitality: 'vitality',
  wealth: 'wealth',
  danger: 'danger_level',
  danger_level: 'danger_level',
  prosperity: 'prosperity',
  population: 'population',
  status: 'status',
  // 新角色属性
  health: 'health',
  energy: 'energy',
  stress: 'stress',
  aging: 'aging',
  focus: 'focus',
  sanity: 'sanity',
  standing: 'standing',
  loyalty: 'loyalty',
  army: 'army',
  retainers: 'retainers',
  secrets: 'secrets',
  martial: 'martial',
  cunning: 'cunning',
  charisma: 'charisma',
  lore: 'lore',
  // Phase 1-5 新字段
  military_prowess: 'military_prowess',
  economic_reliability: 'economic_reliability',
  diplomatic_trust: 'diplomatic_trust',
  cultural_prestige: 'cultural_prestige',
  internal_stability: 'internal_stability',
}

// 有上限的属性
const CAPPED_FIELDS: Record<string, { min: number; max: number }> = {
  morale: { min: 0, max: 100 },
  vitality: { min: 0, max: 100 },
  health: { min: 0, max: 100 },
  energy: { min: 0, max: 100 },
  stress: { min: 0, max: 100 },
  focus: { min: 0, max: 100 },
  sanity: { min: 0, max: 100 },
  loyalty: { min: 0, max: 100 },
  cohesion: { min: 0, max: 100 },
  // Phase 2 声誉维度
  military_prowess: { min: 0, max: 100 },
  economic_reliability: { min: 0, max: 100 },
  diplomatic_trust: { min: 0, max: 100 },
  cultural_prestige: { min: 0, max: 100 },
  internal_stability: { min: 0, max: 100 },
}

// 无上限的属性（最低为 0）
const UNCAPPED_FIELDS = new Set([
  'influence_score', 'military_strength', 'economic_power', 'resources',
  'public_reputation', 'public_perception', 'influence', 'wealth',
  'danger_level', 'prosperity', 'population',
  'aging', 'standing', 'army', 'retainers', 'secrets',
  'martial', 'cunning', 'charisma', 'lore',
])

function normalizeField(field: string): string {
  const lower = field.toLowerCase().trim()
  return FIELD_NORMALIZATION[lower] ?? lower
}

function parseDelta(delta: unknown): number {
  if (typeof delta === 'number') return delta
  if (typeof delta === 'string') {
    const parsed = Number(delta)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function clampValue(field: string, value: number): number {
  const capped = CAPPED_FIELDS[field]
  if (capped) return Math.max(capped.min, Math.min(capped.max, value))
  if (UNCAPPED_FIELDS.has(field)) return Math.max(0, value)
  return value
}

/** 计算单 tick 最大变化量 — 有上限属性用固定值，无上限属性用当前值的 15% */
function getMaxDelta(field: string, currentValue: number): number {
  if (CAPPED_FIELDS[field]) {
    // 有上限属性：固定最大变化
    const fixed: Record<string, number> = {
      morale: 20, vitality: 20, health: 20, energy: 20,
      stress: 20, focus: 20, sanity: 20, loyalty: 20, cohesion: 50,
    }
    return fixed[field] ?? 20
  }
  if (UNCAPPED_FIELDS.has(field)) {
    // 无上限属性：当前值的 15%，最低 5
    return Math.max(5, Math.abs(currentValue) * 0.15)
  }
  return 50
}

function findFaction(world: WorldSnapshot, id: string): Record<string, any> | null {
  const orgs = (world as any).organizations
  if (Array.isArray(orgs)) {
    const found = orgs.find((o: any) => o.id === id || o.name === id)
    if (found) return found
  }
  const factions = (world as any).factions
  if (Array.isArray(factions)) {
    const found = factions.find((f: any) => f.id === id || f.name === id)
    if (found) return found
  }
  return null
}

function findCharacter(world: WorldSnapshot, id: string): Record<string, any> | null {
  const characters = (world as any).characters
  if (Array.isArray(characters)) {
    const found = characters.find((c: any) => c.id === id || c.name === id)
    if (found) return found
  }
  const npcs = world.agents?.npcs
  if (Array.isArray(npcs)) {
    return npcs.find((n: any) =>
      n.name === id || n.id === id
    ) ?? null
  }
  return null
}

function findRegion(world: WorldSnapshot, id: string): Record<string, any> | null {
  const regions = (world as any).regions
  if (!Array.isArray(regions)) return null
  return regions.find((r: any) => r.id === id || r.name === id) ?? null
}

function applyEffectToEntity(entity: Record<string, any>, effect: SimEventEffect): boolean {
  const field = normalizeField(effect.field)
  if (!field) return false

  let delta = parseDelta(effect.delta)
  if (delta === 0) return false

  // Handle custom_metrics.xxx fields
  if (field.startsWith('custom_metrics.')) {
    const metricKey = field.replace('custom_metrics.', '')
    const defs: Array<{ key: string; min: number; max: number; initial?: number }> = entity.custom_metric_defs ?? []
    const def = defs.find(d => d.key === metricKey)

    const min = def?.min ?? 0
    const max = def?.max ?? Infinity
    const range = max - min
    const maxDelta = Math.max(5, range * 0.1)

    delta = Math.max(-maxDelta, Math.min(maxDelta, delta))

    if (!entity.custom_metrics) entity.custom_metrics = {}
    const current = typeof entity.custom_metrics[metricKey] === 'number'
      ? entity.custom_metrics[metricKey]
      : (def?.initial ?? 0)
    const next = Math.max(min, Math.min(max, current + delta))
    entity.custom_metrics[metricKey] = next
    return true
  }

  // Standard field handling — 动态 delta 上限
  const current = typeof entity[field] === 'number' ? entity[field] : 0
  const maxDelta = getMaxDelta(field, current)
  delta = Math.max(-maxDelta, Math.min(maxDelta, delta))

  const next = clampValue(field, current + delta)
  entity[field] = next

  // Sync parallel fields between Faction and Organization types
  if (field === 'public_reputation') {
    entity.public_perception = next
  } else if (field === 'public_perception') {
    entity.public_reputation = next
  }

  return true
}

export function applyConsequences(world: WorldSnapshot, events: SimEvent[], nextMood: string): ConsequenceResult {
  const allEffects = events.flatMap(e => e.effects ?? [])
  let applied = 0

  for (const effect of allEffects) {
    if (!effect.target_id || !effect.field) continue

    let entity: Record<string, any> | null = null

    switch (effect.target_type) {
      case 'organization':
        entity = findFaction(world, effect.target_id)
        break
      case 'character':
        entity = findCharacter(world, effect.target_id)
        break
      case 'region':
        entity = findRegion(world, effect.target_id)
        break
      case 'world':
        entity = world as any
        break
    }

    if (entity && applyEffectToEntity(entity, effect)) {
      applied++
    }
  }

  const updatedWorld: WorldSnapshot = {
    ...world,
    world_mood: nextMood,
  } as WorldSnapshot & { world_mood?: string }

  return {
    world: updatedWorld,
    applied_effects: applied,
    summary: applied > 0
      ? `应用了 ${applied} 个效果`
      : '没有效果需要应用',
  }
}
