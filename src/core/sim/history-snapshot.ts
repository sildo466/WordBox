/**
 * Tick-level snapshot for dashboard history tracking.
 * Captures key metrics of organizations, characters, and regions per tick.
 */

export type OrgSnapshot = {
  id: string
  name: string
  influence_score: number
  military_strength: number
  economic_power: number
  cohesion: number
  public_reputation: number
  resources: number
  member_count: number
  custom_metrics?: Record<string, number>
  population?: number
}

export type CharSnapshot = {
  id: string
  name: string
  organization_id: string | null
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
  custom_metrics?: Record<string, number>
}

export type RegionSnapshot = {
  id: string
  name: string
  danger_level: number
  prosperity: number
  population: number | string
  controlling_organization_id: string | null
  custom_metrics?: Record<string, number>
}

export type TickSnapshot = {
  tick: number
  timestamp: number
  organizations: OrgSnapshot[]
  characters: CharSnapshot[]
  regions: RegionSnapshot[]
  world_mood: string
  event_count: number
}

/** Maximum number of snapshots to retain (trims oldest when exceeded) */
export const MAX_HISTORY_SNAPSHOTS = 200
