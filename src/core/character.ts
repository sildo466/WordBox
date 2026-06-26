/**
 * Character domain types — user-defined character specifications.
 *
 * These types are the structured representation of user input. Characters
 * are parsed directly from the user's world prompt, NOT reinterpreted by
 * the LLM. The LLM only fills in details (voice, approach, dialogue style)
 * that the user didn't explicitly specify.
 */

import type { VitalSigns, PersonalityTraits } from './world'

/**
 * Origin of a character specification — was it user-defined or auto-generated?
 * Used to prioritise user specs during initialization and to prevent the LLM
 * from overwriting them during generation.
 */
export type CharacterOrigin = 'user_defined' | 'llm_filled' | 'template'

/**
 * Character role assignment for the overall storyline.
 * Unlike narrative_roles which are dynamic emergence, these are preset by
 * the user or the world generator as the character's intended role.
 */
export type CharacterStoryRole =
  | 'protagonist'
  | 'antagonist'
  | 'deuteragonist'
  | 'tritagonist'
  | 'supporting'
  | 'mentor'
  | 'love_interest'
  | 'foil'
  | 'sidekick'
  | 'neutral'
  | 'background'

/**
 * Character specification — the canonical representation of a character
 * in a world. User-defined characters are created directly from this spec;
 * auto-generated characters are also represented as specs for consistency.
 */
export type CharacterSpec = {
  /** Unique identifier */
  id: string

  /** Origin: user-defined specs are authoritative */
  origin: CharacterOrigin

  /** Core identity */
  name: string
  aliases?: string[]
  title?: string       // e.g. "The Shadow King", "大使"
  age?: number
  gender?: string

  /** User's original description of this character (free text) */
  description?: string

  /** Physical description (LLM fills if user omitted) */
  appearance?: string

  /** Role in the overall storyline */
  story_role: CharacterStoryRole

  /** Faction name (extracted from user input, resolved to faction_id later) */
  faction_allegiance?: string

  /** Faction allegiance — references Faction.id */
  faction_id?: string

  /** Starting location within the world */
  initial_location?: string

  /** Personal traits (Big Five + extras) */
  persona?: Partial<PersonalityTraits>

  /** Initial vitals (LLM fills if omitted) */
  initial_vitals?: Partial<VitalSigns>

  /**
   * Preset beliefs / core convictions.
   * These override any auto-generated beliefs during initialization.
   */
  core_beliefs: string[]

  /**
   * Initial goals — these are the character's driving motivations.
   * User-defined goals are authoritative; LLM adds fill goals.
   */
  initial_goals: string[]

  /**
   * Predefined relationships with other characters.
   * Keyed by character ID, value describes the relationship from this
   * character's perspective (e.g. "older brother", "sworn enemy").
   */
  relationships: Record<string, string>

  /**
   * Expertise / skills that this character possesses.
   * User-defined entries are authoritative.
   */
  expertise: string[]

  /**
   * Emotional baseline — character's default emotional state.
   */
  emotional_baseline?: {
    label: string
    intensity: number  // [0-1]
  }

  /**
   * Voice / speaking style — used in dialogue generation.
   * LLM fills if not user-specified.
   */
  voice?: string

  /**
   * Approach / behavioral style — how the character tends to act.
   * LLM fills if not user-specified.
   */
  approach?: string

  /**
   * Dialogue style — narrative description of how they speak.
   */
  dialogue_style?: string

  /** Backstory (user-defined supersedes LLM-generated) */
  backstory?: string

  /**
   * Tags for filtering and grouping.
   * e.g. ["royalty", "mage", "eastern-alliance"]
   */
  tags: string[]

  /**
   * Life status at world creation.
   */
  initial_life_status: 'alive' | 'dead' | 'unknown'
}

/**
 * Relationship edge between two characters.
 * Stored as a flat record for quick lookups, but can be expanded into
 * this structured form for display and analysis.
 */
export type CharacterRelation = {
  source_id: string
  target_id: string
  /** Label from source's perspective (e.g. "master", "rival") */
  label: string
  /** Reverse label from target's perspective (e.g. "apprentice", "rival") */
  reverse_label?: string
  /** Affinity [-1 (hatred) to 1 (love)] */
  affinity: number
  /** Whether this relation is user-defined (authoritative) */
  user_defined: boolean
}

/**
 * Character template — a reusable archetype for auto-generation.
 */
export type CharacterTemplate = {
  id: string
  name: string
  description: string
  story_roles: CharacterStoryRole[]
  tags: string[]
  suggested_traits?: Partial<PersonalityTraits>
  suggested_vitals?: Partial<VitalSigns>
}

/**
 * Factory helper: create a minimal CharacterSpec from user input.
 */
export function createCharacterSpec(input: {
  name: string
  story_role?: CharacterStoryRole
  description?: string
  faction_allegiance?: string
  initial_location?: string
  faction_id?: string
  core_beliefs?: string[]
  initial_goals?: string[]
  relationships?: Record<string, string>
  expertise?: string[]
  initial_vitals?: Partial<VitalSigns>
  persona?: Partial<PersonalityTraits>
  tags?: string[]
}): CharacterSpec {
  return {
    id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    origin: 'user_defined',
    name: input.name,
    story_role: input.story_role || 'background',
    description: input.description,
    faction_allegiance: input.faction_allegiance,
    initial_location: input.initial_location,
    faction_id: input.faction_id,
    core_beliefs: input.core_beliefs || [],
    initial_goals: input.initial_goals || [],
    relationships: input.relationships || {},
    expertise: input.expertise || [],
    initial_vitals: input.initial_vitals,
    persona: input.persona,
    tags: input.tags || [],
    initial_life_status: 'alive',
  }
}

/**
 * Sanitise a display name for safe usage as a key or filename.
 */
export function sanitiseCharacterName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿぀-ゟ゠-ヿ]/g, '_')
}
