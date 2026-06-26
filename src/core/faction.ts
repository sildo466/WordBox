/**
 * Faction domain types — group/organisation/power-block definitions.
 *
 * Factions represent organised groups within the world. They have
 * influence, territory, resources, and relationships with other factions.
 * Characters belong to factions, and faction-level dynamics drive
 * macro-level narrative events.
 */

/**
 * Faction alignment — the faction's fundamental stance.
 */
export type FactionAlignment =
  | 'benevolent'
  | 'neutral'
  | 'selfish'
  | 'hostile'
  | 'chaotic'

/**
 * Faction influence level — how much reach the faction has.
 */
export type FactionInfluenceLevel =
  | 'global'      // Affects the entire world
  | 'regional'    // Dominant in a region
  | 'local'       // Significant in a locale
  | 'fringe'      // Small, marginal
  | 'declining'   // Formerly powerful, now fading

/**
 * Faction relationship — how two factions view each other.
 */
export type FactionRelation = {
  target_id: string
  /** Stance [-1 (war) to 1 (alliance)] */
  stance: number
  /** Public label (e.g. "Allies", "Trade Partners", "At War") */
  label: string
  /** Whether this relation is user-defined */
  user_defined: boolean
}

/**
 * Faction type category.
 */
export type FactionCategory =
  | 'government'
  | 'military'
  | 'religious'
  | 'commercial'
  | 'secret_society'
  | 'cultural'
  | 'rebel'
  | 'academic'
  | 'criminal'
  | 'tribal'
  | 'other'

/**
 * Faction definition.
 */
export type Faction = {
  /** Unique identifier */
  id: string

  /** Display name */
  name: string

  /** Category */
  category: FactionCategory

  /** Alignment */
  alignment: FactionAlignment

  /** Influence level */
  influence: FactionInfluenceLevel

  /** Numerical influence score for comparison */
  influence_score: number

  /** Resource level */
  resources: number

  /** Territory / sphere of influence description */
  territory?: string

  /** Core ideology / purpose */
  ideology: string

  /** Key traits of this faction (e.g. ["hierarchical", "expansionist"]) */
  traits: string[]

  /** Internal cohesion [0-1] — how unified the faction is */
  cohesion: number

  /** Relations with other factions */
  relations: FactionRelation[]

  /** Leader character IDs */
  leader_ids: string[]

  /** Notable member character IDs */
  member_ids: string[]

  /** Tags for filtering */
  tags: string[]

  /** Whether this faction was user-defined (authoritative) */
  user_defined: boolean

  /** Optional backstory / history */
  history?: string

  /** Public perception [-1 (feared/despised) to 1 (admired/loved)] */
  public_perception: number

  /** Military strength — combat capability */
  military_strength?: number

  /** Economic power — trade and production capability */
  economic_power?: number

  /** Current status — dynamic state tracking */
  status?: 'rising' | 'stable' | 'declining' | 'collapsed'
}

/**
 * Faction creation input — what the user might specify in their prompt.
 */
export type FactionInput = {
  name: string
  description?: string
  category?: FactionCategory
  alignment?: FactionAlignment
  influence?: FactionInfluenceLevel
  ideology?: string
  traits?: string[]
  leader_names?: string[]
  member_names?: string[]
  core_values?: string[]
  public_perception?: number
}

/**
 * Faction-level dynamic state (mutated during simulation).
 */
export type FactionState = {
  faction_id: string
  current_influence: number      // [0-100]
  current_resources: number      // [0-100]
  current_cohesion: number       // [0-1]
  current_perception: number     // [-1, 1]
  active_conflicts: string[]     // IDs of active conflicts
  active_alliances: string[]     // IDs of allied factions
  recent_events: Array<{
    tick: number
    description: string
    impact: 'positive' | 'negative' | 'neutral'
  }>
}

/**
 * Factory helper: create a Faction from user input.
 */
export function createFaction(input: FactionInput): Faction {
  const id = `faction-${input.name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_')}`
  return {
    id,
    name: input.name,
    category: input.category || 'other',
    alignment: input.alignment || 'neutral',
    influence: input.influence || 'local',
    influence_score: 50,
    resources: 50,
    ideology: input.ideology || '',
    traits: input.traits || [],
    cohesion: 0.7,
    relations: [],
    leader_ids: [],
    member_ids: [],
    tags: [],
    user_defined: true,
    public_perception: input.public_perception ?? 0,
    history: input.description,
  }
}
