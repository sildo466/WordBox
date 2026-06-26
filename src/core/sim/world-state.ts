export type WorldTime = {
  tick: number
  day: number
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  year: number
  era_label: string
}

export type GlobalCrisis = {
  id: string
  type: 'war' | 'plague' | 'famine' | 'disaster' | 'political' | 'economic' | 'magical' | 'other'
  name: string
  description: string
  severity: number
  affected_regions: string[]
  started_at_tick: number
  status: 'brewing' | 'active' | 'resolving' | 'resolved'
}

export type WorldState = {
  id: string
  premise: string
  language: string
  time: WorldTime
  regions: string[]
  organizations: string[]
  characters: string[]
  active_crises: GlobalCrisis[]
  god_commands: string[]
  pending_events: string[]
  world_mood: string
  dominant_faction_id: string | null
  tick_speed: 'slow' | 'normal' | 'fast' | 'paused'
  config: {
    max_regions: number
    max_organizations: number
    max_characters: number
    auto_tick: boolean
    tick_interval_ms: number
  }
}

export function createWorldTime(tick = 0): WorldTime {
  const day = (tick % 360) + 1
  const year = Math.floor(tick / 360) + 1
  const seasonIndex = Math.floor(((tick % 360) / 90))
  const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
  return {
    tick,
    day,
    season: seasons[seasonIndex] ?? 'spring',
    year,
    era_label: `Year ${year}`,
  }
}

export function createWorldState(id: string, premise: string, language = 'zh-CN'): WorldState {
  return {
    id,
    premise,
    language,
    time: createWorldTime(0),
    regions: [],
    organizations: [],
    characters: [],
    active_crises: [],
    god_commands: [],
    pending_events: [],
    world_mood: 'calm',
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
