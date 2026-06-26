import type { CharacterSpec } from './character'
import type { Faction } from './faction'
import type { StorylinePreset, TimelineEntry } from './storyline'

/** 叙事状态 — 通用记录，叙事引擎已移除 */
export type NarrativeState = {
  patterns: Array<Record<string, unknown>>
  arcs: Array<Record<string, unknown>>
  summaries: Array<Record<string, unknown>>
  stats: {
    total_patterns: number
    active_patterns: number
    concluded_patterns: number
    total_arcs: number
    completed_arcs: number
  }
}

export type EntityKind = 'world' | 'persona' | 'personal' | 'social'

export type MemoryRecord = {
  id: string
  content: string
  importance: number
  emotional_weight: number
  source: 'self' | 'social' | 'world'
  timestamp: string
  decay_rate: number
  retrieval_strength: number
}

export type VitalSigns = {
  energy: number
  stress: number
  sleep_debt: number
  focus: number
  aging_index: number
}

export type PersonalityTraits = {
  openness: number
  stability: number
  attachment: number
  agency: number
  empathy: number
}

export type WorldAtmosphere = {
  macro_events: string[]
  narratives: string[]
  pressures: string[]
  institutions: string[]
  ambient_noise: string[]
}

export type SimAgent = {
  kind: 'personal'
  id: string
  name: string
  short_term: MemoryRecord[]
  long_term: MemoryRecord[]
  condition: VitalSigns
  emotion: {
    label: string
    intensity: number
  }
  traits: PersonalityTraits
  goals: string[]
  relations: Record<string, number>
  history: Array<{ type: string; timestamp: string }>

  // 生命周期
  life_status: 'alive' | 'dying' | 'dead' | 'reincarnating'
  death_tick?: number
  cause_of_death?: string
  legacy?: string[]

  // LLM 生成的角色个性
  occupation?: string
  voice?: string
  approach?: string
  expertise?: string[]
  philosophy?: string
  success_metrics?: Record<string, number>

  // 时间引擎 — 活跃模式
  activity_pattern?: number[]
  timezone_offset?: number
  sleep_schedule?: {
    typical_sleep_hour: number
    typical_wake_hour: number
  }

  // 涌现叙事 — 动态角色定位
  narrative_roles?: {
    [narrativeId: string]: {
      role: 'protagonist' | 'antagonist' | 'supporting' | 'observer' | 'catalyst'
      involvement: number
      impact: number
    }
  }

  // LLM 决策输出 — 每 tick 更新
  last_action_description?: string
  last_dialogue?: string
  last_inner_monologue?: string
  location?: string
}

export type SystemsState = Record<string, unknown>

export type WorldSettings = {
  language: string
  reborn_suffix?: string
  past_life_prefix?: string
}

export type WorldSnapshot = {
  world_id: string
  title?: string
  summary?: string
  tick: number
  time: string
  config: WorldSettings
  environment: {
    description: string
  }
  social_context: WorldAtmosphere
  agents: {
    director: { kind: 'world'; id: string }
    creator: { kind: 'persona'; id: string }
    personal: SimAgent
    social: { kind: 'social'; id: string }
    npcs: SimAgent[]
  }
  narratives: NarrativeState
  events: Array<{ id: string; type: string; timestamp: string; payload?: Record<string, unknown> }>
  relations: Record<string, number>
  active_hooks: string[]
  systems: SystemsState
  tick_summary?: string

  // Phase 1 新增
  characters: CharacterSpec[]
  factions: Faction[]
  storyline_presets: StorylinePreset[]
  timeline: TimelineEntry[]
  history_snapshots?: import('./sim/history-snapshot').TickSnapshot[]
}

export type { WorldState, WorldTime, GlobalCrisis } from './sim/world-state'
export type { SimEvent, SimEventType, SimEventEffect, SimEventVisibility } from './sim/event'
export type { GodCommand, CommandStatus, CommandStrength, CommandTargetType } from './sim/command'
export type { SimCharacter, CharacterTask, CharacterDesire } from './sim/character'
export type { Organization } from './sim/organization'
export type { Region } from './sim/region'

export function snapshotToWorldState(snapshot: WorldSnapshot): import('./sim/world-state').WorldState {
  const worldMood = (snapshot as WorldSnapshot & { world_mood?: string }).world_mood ?? 'calm'
  const regions = ((snapshot as WorldSnapshot & { regions?: Array<{ id?: string; name?: string } | string> }).regions ?? [])
    .map((region, index) => {
      if (typeof region === 'string') return region
      return region.id ?? region.name ?? `region-${index + 1}`
    })
  const organizations = ((snapshot as WorldSnapshot & { organizations?: Array<{ id?: string; name?: string } | string> }).organizations ?? [])
    .map((org, index) => {
      if (typeof org === 'string') return org
      return org.id ?? org.name ?? `org-${index + 1}`
    })
  const commandIds = ((snapshot as WorldSnapshot & { god_commands?: Array<{ id?: string } | string> }).god_commands ?? [])
    .map((cmd, index) => {
      if (typeof cmd === 'string') return cmd
      return cmd.id ?? `cmd-${index + 1}`
    })

  return {
    id: snapshot.world_id,
    premise: snapshot.environment.description,
    language: snapshot.config.language,
    time: {
      tick: snapshot.tick,
      day: (snapshot.tick % 360) + 1,
      season: 'spring',
      year: Math.floor(snapshot.tick / 360) + 1,
      era_label: `Year ${Math.floor(snapshot.tick / 360) + 1}`,
    },
    regions,
    organizations: organizations.length > 0 ? organizations : snapshot.factions.map(f => f.id),
    characters: snapshot.characters.map(c => c.id),
    active_crises: [],
    god_commands: commandIds,
    pending_events: snapshot.events.map(e => e.id),
    world_mood: worldMood,
    dominant_faction_id: null,
    tick_speed: 'paused',
    config: {
      max_regions: 12,
      max_organizations: 8,
      max_characters: 20,
      auto_tick: false,
      tick_interval_ms: 3000,
    },
  }
}

export function worldStateToSnapshot(
  worldState: import('./sim/world-state').WorldState,
): WorldSnapshot {
  const worldMood = worldState.world_mood
  return {
    world_id: worldState.id,
    title: worldState.premise.slice(0, 48) || undefined,
    summary: worldState.premise.slice(0, 96) || undefined,
    tick: worldState.time.tick,
    time: new Date(worldState.time.tick * 1000).toISOString(),
    config: { language: worldState.language },
    environment: { description: worldState.premise },
    social_context: {
      macro_events: [],
      narratives: [],
      pressures: [],
      institutions: [],
      ambient_noise: [],
    },
    agents: {
      director: { kind: 'world', id: `${worldState.id}-director` },
      creator: { kind: 'persona', id: `${worldState.id}-creator` },
      personal: {
        kind: 'personal',
        life_status: 'alive',
        id: worldState.id,
        name: worldState.id,
        short_term: [],
        long_term: [],
        condition: { energy: 0.65, stress: 0.25, sleep_debt: 0.15, focus: 0.55, aging_index: 0.05 },
        emotion: { label: worldState.world_mood, intensity: 0.15 },
        traits: { openness: 0.55, stability: 0.45, attachment: 0.5, agency: 0.5, empathy: 0.5 },
        goals: [],
        relations: {},
        history: [],
      },
      social: { kind: 'social', id: `${worldState.id}-social` },
      npcs: [],
    },
    narratives: { patterns: [], arcs: [], summaries: [], stats: { total_patterns: 0, active_patterns: 0, concluded_patterns: 0, total_arcs: 0, completed_arcs: 0 } },
    events: [],
    relations: {},
    active_hooks: [],
    systems: {},
    characters: worldState.characters.map(cid => ({
      id: cid, origin: 'llm_filled', name: cid, story_role: 'neutral',
      core_beliefs: [], initial_goals: [], relationships: {}, expertise: [], tags: [], initial_life_status: 'alive',
    })),
    factions: worldState.organizations.map(oid => ({
      id: oid, name: oid, category: 'other', alignment: 'neutral', influence: 'local',
      influence_score: 30, resources: 30, ideology: '', traits: [], cohesion: 0.7,
      relations: [], leader_ids: [], member_ids: [], tags: [], user_defined: false, public_perception: 0,
    })),
    storyline_presets: [],
    timeline: [],
    world_mood: worldMood,
    god_commands: [],
    regions: worldState.regions.map(rid => ({
      id: rid, name: rid, terrain: 'plains', danger_level: 0.1, controlling_organization_id: null,
    })),
    organizations: worldState.organizations.map(oid => ({
      id: oid, name: oid, type: 'other', status: 'stable', influence_score: 0.3,
    })),
  } as WorldSnapshot
}

export function createEmptySnapshot(): WorldSnapshot {
  return {
    world_id: 'world-1',
    title: undefined,
    summary: undefined,
    tick: 0,
    time: new Date(0).toISOString(),
    config: { language: 'zh' },
    environment: { description: 'calm' },
    social_context: {
      macro_events: [],
      narratives: [],
      pressures: [],
      institutions: [],
      ambient_noise: [],
    },
    agents: {
      director: { kind: 'world', id: 'director-1' },
      creator: { kind: 'persona', id: 'creator-1' },
      personal: {
        kind: 'personal',
        life_status: 'alive',
        id: 'default-user',
        name: 'user',
        short_term: [],
        long_term: [],
        condition: { energy: 0.65, stress: 0.25, sleep_debt: 0.15, focus: 0.55, aging_index: 0.05 },
        emotion: { label: 'calm', intensity: 0.15 },
        traits: { openness: 0.55, stability: 0.45, attachment: 0.5, agency: 0.5, empathy: 0.5 },
        goals: [],
        relations: {},
        history: [],
      },
      social: { kind: 'social', id: 'social-1' },
      npcs: [],
    },
    narratives: { patterns: [], arcs: [], summaries: [], stats: { total_patterns: 0, active_patterns: 0, concluded_patterns: 0, total_arcs: 0, completed_arcs: 0 } },
    events: [],
    relations: {},
    active_hooks: [],
    systems: {},
    characters: [],
    factions: [],
    storyline_presets: [],
    timeline: [],
  }
}

export type WorldMeta = {
  id: string
  worldPrompt: string
  personaPrompt?: string
  title?: string
  summary?: string
  tick?: number
  characterCount?: number
  factionCount?: number
  agentCount?: number
  eventCount?: number
  lastSnapshotAt?: string
  storageVersion?: number
  createdAt: string
  updatedAt: string
}
