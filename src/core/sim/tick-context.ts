import type { WorldSnapshot } from '@/core/world'
import type { WorldState } from '@/core/sim/world-state'
import type { GodCommand } from '@/core/sim/command'
import { deriveStrategyProfile, describePersonality } from './org-personality'
import { formatReputationForLLM, calcOverallReputation } from './org-reputation'
import { formatResourcesForLLM } from './org-resources'
import { generateStrategicAnalysis } from './strategic-analysis'
import { allocateAttention, buildAttentionTargets } from './org-attention'
import { formatTensionsForLLM, calcGlobalTension } from './tension-system'
import { formatCoalitionsForLLM } from './coalition'
import { formatIdeologiesForLLM } from './ideology-propagation'

export type TickRegionSummary = {
  id: string
  name: string
  terrain: string
  danger_level: number
  controlling_organization_id: string | null
  description?: string
  population?: number | string
  prosperity?: number
  resources?: string[]
  notable_locations?: string[]
}

export type TickOrganizationSummary = {
  id: string
  name: string
  type: string
  status: string
  influence_score: number
  description?: string
  military_strength?: number
  economic_power?: number
  cohesion?: number
  public_reputation?: number
  resources?: number
  ideology?: string
  custom_metrics?: Record<string, number>
  custom_metric_defs?: Array<{ key: string; name: string; min: number; max: number; initial?: number; unit?: string }>
  population?: number
  // Phase 1-5 新增字段
  personality?: import('./org-personality').OrgPersonality
  reputation?: import('./org-reputation').OrgReputation
  resource_pool?: import('./org-resources').OrgResourcePool
  strategic_analysis?: import('./strategic-analysis').StrategicAnalysis
  attention?: import('./org-attention').AttentionAllocation
  strategy_profile?: import('./org-personality').StrategyProfile
  personality_description?: string
  reputation_description?: string
}

export type TickCharacterSummary = {
  id: string
  name: string
  status: string
  organization_id: string | null
  current_task: string | null
  // 身体
  vitality: number
  health: number
  energy: number
  stress: number
  aging: number
  // 精神
  morale: number
  focus: number
  sanity: number
  // 社会
  influence: number
  reputation: number
  standing: number
  loyalty: number
  // 资源
  wealth: number
  army: number
  retainers: number
  secrets: number
  // 能力
  martial: number
  cunning: number
  charisma: number
  lore: number
  // 状态
  condition?: string
  // 关系摘要
  key_relations?: Array<{ name: string; type: string; strength: number }>
  // 欲望摘要
  top_desires?: Array<{ type: string; intensity: number }>
  custom_metrics?: Record<string, number>
}

export type TickEventSummary = {
  id?: string
  title: string
  summary: string
  tick: number
}

export type TickContext = {
  worldId: string
  premise: string
  language: string
  tick: number
  eraLabel: string
  worldMood: string
  regions: TickRegionSummary[]
  organizations: TickOrganizationSummary[]
  characters: TickCharacterSummary[]
  recentEvents: TickEventSummary[]
  pendingCommands: GodCommand[]
  // Phase 1-5 新增全局上下文
  global_tension?: number
  tensions_summary?: string
  coalitions_summary?: string
  ideologies_summary?: string
}

function hasWorldStateShape(world: WorldSnapshot | WorldState): world is WorldState {
  const candidate = world as Record<string, unknown>
  const time = candidate.time as Record<string, unknown> | undefined
  return (
    typeof time?.tick === 'number'
    && typeof candidate.premise === 'string'
    && typeof candidate.world_id !== 'string'
  )
}

/** 从角色数据提取关键关系摘要（最多 5 个） */
function extractKeyRelations(char: any, allChars: any[]): Array<{ name: string; type: string; strength: number }> {
  const relations = char.relations ?? []
  return relations.slice(0, 5).map((r: any) => {
    const other = allChars.find((c: any) => c.id === r.character_id)
    return {
      name: other?.name ?? r.character_id,
      type: r.type ?? 'neutral',
      strength: r.strength ?? 0,
    }
  })
}

/** 从角色数据提取欲望摘要（按强度排序，最多 3 个） */
function extractTopDesires(char: any): Array<{ type: string; intensity: number }> {
  const desires = char.desires ?? []
  return desires
    .sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0))
    .slice(0, 3)
    .map((d: any) => ({ type: d.type ?? 'other', intensity: d.intensity ?? 0 }))
}

export function buildTickContext(
  world: WorldSnapshot | WorldState,
  fallbackCommands: GodCommand[] = [],
  nextTick?: number,
): TickContext {
  if (hasWorldStateShape(world)) {
    return {
      worldId: world.id,
      premise: world.premise,
      language: world.language,
      tick: nextTick ?? (world.time.tick + 1),
      eraLabel: `Round ${nextTick ?? (world.time.tick + 1)}`,
      worldMood: world.world_mood,
      regions: world.regions.map((regionId, index) => ({
        id: regionId,
        name: regionId,
        terrain: 'plains',
        danger_level: 0.1 + index * 0.02,
        controlling_organization_id: null,
      })),
      organizations: world.organizations.map((organizationId, index) => ({
        id: organizationId,
        name: organizationId,
        type: 'other',
        status: 'stable',
        influence_score: 0.3 + index * 0.05,
      })),
      characters: world.characters.map((characterId, index) => ({
        id: characterId,
        name: characterId,
        status: 'alive',
        organization_id: null,
        current_task: null,
        vitality: 80, health: 80, energy: 70, stress: 20, aging: 20,
        morale: 55, focus: 60, sanity: 80,
        influence: 1, reputation: 1, standing: 1, loyalty: 50,
        wealth: 1, army: 0, retainers: 0, secrets: 0,
        martial: 1, cunning: 1, charisma: 1, lore: 1,
      })),
      recentEvents: (world.pending_events ?? []).slice(-10).map((eventId, index) => ({
        id: eventId,
        title: eventId,
        summary: eventId,
        tick: (nextTick ?? world.time.tick) - index,
      })),
      pendingCommands: fallbackCommands,
    }
  }

  const currentTick = nextTick ?? world.tick + 1
  const allChars = (world as any).characters ?? []
  const allOrgsForGlobal = ((world as any).organizations ?? (world as any).factions ?? []).map((o: any) => ({ id: o.id, name: o.name }))

  return {
    worldId: world.world_id,
    premise: world.environment.description,
    language: world.config.language,
    tick: currentTick,
    eraLabel: `Round ${currentTick}`,
    worldMood: (world as WorldSnapshot & { world_mood?: string }).world_mood ?? 'calm',
    regions: ((world as WorldSnapshot & { regions?: TickRegionSummary[] }).regions ?? []).map(region => ({
      id: region.id,
      name: region.name,
      terrain: region.terrain ?? 'plains',
      danger_level: region.danger_level ?? 0.1,
      controlling_organization_id: region.controlling_organization_id ?? null,
      description: region.description,
      population: region.population,
      prosperity: region.prosperity,
      resources: region.resources,
      notable_locations: region.notable_locations,
    })),
    organizations: ((world as WorldSnapshot & { organizations?: TickOrganizationSummary[] }).organizations ?? world.factions ?? []).map(org => {
      const orgAny = org as any
      const personality = orgAny.personality
      const reputation = orgAny.reputation
      const resourcePool = orgAny.resource_pool
      const relations = orgAny.relations ?? []
      const territory = orgAny.territory ?? []

      // 生成策略档案
      const strategyProfile = personality ? deriveStrategyProfile(personality) : undefined
      const personalityDesc = personality ? describePersonality(personality) : undefined

      // 声誉描述
      const reputationDesc = reputation ? formatReputationForLLM(org.name, reputation) : undefined

      // 战略分析
      const allOrgsForAnalysis = ((world as any).organizations ?? (world as any).factions ?? [])
      const powerRatings: Record<string, number> = {}
      for (const o of allOrgsForAnalysis) {
        powerRatings[o.id] = (o.military_strength ?? 0) * 2.2 + (o.influence_score ?? 0) * 0.8 + (o.economic_power ?? 0) * 0.6 + ((o.territory?.length ?? 0)) * 3.5
      }
      const strategicAnalysis = generateStrategicAnalysis(org.id, allOrgsForAnalysis, powerRatings, currentTick)

      // 注意力分配
      const attentionTargets = buildAttentionTargets(
        org.id, allOrgsForAnalysis,
        (world as any).regions ?? [],
        ((world as any).events ?? []).slice(-10),
        (world as any)._tensions ?? [],
      )
      const attention = personality ? allocateAttention(org.id, personality, attentionTargets, orgAny.attention_fatigue ?? 0) : undefined

      return {
        id: org.id,
        name: org.name,
        type: orgAny.type ?? orgAny.category ?? 'other',
        status: orgAny.status ?? 'stable',
        influence_score: orgAny.influence_score ?? 0,
        description: orgAny.description,
        military_strength: orgAny.military_strength,
        economic_power: orgAny.economic_power,
        cohesion: orgAny.cohesion,
        public_reputation: orgAny.public_reputation ?? orgAny.public_perception,
        resources: orgAny.resources,
        ideology: orgAny.ideology,
        custom_metrics: orgAny.custom_metrics,
        custom_metric_defs: orgAny.custom_metric_defs,
        population: orgAny.population,
        personality,
        reputation,
        resource_pool: resourcePool,
        strategic_analysis: strategicAnalysis,
        attention,
        strategy_profile: strategyProfile,
        personality_description: personalityDesc,
        reputation_description: reputationDesc,
      }
    }),
    characters: allChars.map((char: any) => ({
      id: char.id ?? '',
      name: char.name ?? '',
      status: char.status ?? 'alive',
      organization_id: char.organization_id ?? char.faction_id ?? null,
      current_task: char.current_task?.description ?? char.initial_goals?.[0] ?? null,
      // 身体
      vitality: char.vitality ?? 80,
      health: char.health ?? 80,
      energy: char.energy ?? 70,
      stress: char.stress ?? 20,
      aging: char.aging ?? 20,
      // 精神
      morale: char.morale ?? 55,
      focus: char.focus ?? 60,
      sanity: char.sanity ?? 80,
      // 社会
      influence: char.influence ?? 1,
      reputation: char.reputation ?? 1,
      standing: char.standing ?? 1,
      loyalty: char.loyalty ?? 50,
      // 资源
      wealth: char.wealth ?? 1,
      army: char.army ?? 0,
      retainers: char.retainers ?? 0,
      secrets: char.secrets ?? 0,
      // 能力
      martial: char.martial ?? 1,
      cunning: char.cunning ?? 1,
      charisma: char.charisma ?? 1,
      lore: char.lore ?? 1,
      // 状态
      condition: char.condition,
      // 关系和欲望
      key_relations: extractKeyRelations(char, allChars),
      top_desires: extractTopDesires(char),
      custom_metrics: char.custom_metrics,
    })),
    recentEvents: ((world.events ?? []) as any[]).slice(-20).map((event: any) => ({
      id: event.id ?? '',
      title: event.title ?? event.type ?? '',
      summary: event.summary ?? event.description ?? '',
      tick: event.tick ?? world.tick,
    })),
    pendingCommands: fallbackCommands,
    // 全局上下文数据
    global_tension: calcGlobalTension((world as any)._tensions ?? []),
    tensions_summary: formatTensionsForLLM((world as any)._tensions ?? [], allOrgsForGlobal),
    coalitions_summary: formatCoalitionsForLLM((world as any)._coalitions ?? [], allOrgsForGlobal),
    ideologies_summary: formatIdeologiesForLLM((world as any)._ideologies ?? [], allOrgsForGlobal),
  }
}
