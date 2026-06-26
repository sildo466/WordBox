/**
 * Storyline domain types — preset narrative framework for epic multi-volume storylines.
 *
 * Unlike the emergent narrative system (NarrativeRecognizer/StoryArcDetector) which
 * discovers patterns from events, StorylinePreset defines the intended narrative
 * structure in advance. The simulation then plays out within this framework,
 * allowing divergence and emergent branches.
 *
 * Supports the "8-volume epic, 4 factions" use case: each volume is a major
 * story arc with chapters, trigger conditions, and branching paths.
 */

/**
 * Trigger condition — when a storyline event or chapter should activate.
 */
export type TriggerCondition = {
  /** Type of trigger */
  type:
    | 'tick_threshold'       // After N ticks
    | 'event_occurred'       // A specific event happened
    | 'character_state'      // Character reached a state (location, relationship, etc.)
    | 'faction_state'        // Faction reached a threshold
    | 'user_input'           // Waits for user to trigger
    | 'emergent_pattern'     // An emergent narrative pattern was recognised
    | 'compound'             // Combination of conditions (AND/OR)

  /** Parameters vary by type */
  params: Record<string, unknown>

  /** For compound conditions */
  operator?: 'AND' | 'OR'
  sub_conditions?: TriggerCondition[]
}

/**
 * Storyline event — a specific event within a chapter.
 */
export type StorylineEvent = {
  /** Event identifier within the storyline */
  id: string

  /** Event type */
  type:
    | 'plot_point'       // Major story beat
    | 'conflict'         // Conflict erupts
    | 'revelation'       // Key information revealed
    | 'character_intro'  // New character enters
    | 'character_death'  // Character death (can be conditional)
    | 'battle'           // Major battle
    | 'betrayal'         // Betrayal event
    | 'alliance'         // Alliance formed
    | 'discovery'        // Discovery of something important
    | 'climax'           // Volume/chapter climax
    | 'resolution'       // Resolution
    | 'custom'           // Custom event type

  /** Title of the event */
  title: string

  /** Description / narrative text */
  description: string

  /** Characters involved (referenced by CharacterSpec.id) */
  involved_characters: string[]

  /** Trigger condition for this event */
  trigger: TriggerCondition

  /**
   * Whether this event is mandatory or optional.
   * Optional events may be skipped if conditions aren't met.
   */
  required: boolean

  /**
   * Branching: alternative event IDs if this event is skipped.
   */
  fallback_to?: string[]

  /**
   * Effects that this event has on the world state when triggered.
   */
  effects?: StorylineEffect[]

  /**
   * Tags for filtering and display
   */
  tags: string[]
}

/**
 * Effect of a storyline event on the world.
 */
export type StorylineEffect = {
  type:
    | 'set_environment'
    | 'modify_character_relation'
    | 'modify_faction_stance'
    | 'add_character'
    | 'remove_character'
    | 'set_character_state'
    | 'add_goal'
    | 'add_pressure'
    | 'narrative_shift'
    | 'custom'
  target: string            // What is affected (character ID, faction ID, etc.)
  value: unknown            // Effect value
  description: string       // Human-readable description
}

/**
 * Chapter — a sequence of events within a volume.
 */
export type Chapter = {
  /** Chapter identifier within the volume (e.g. "ch-1", "ch-2") */
  id: string

  /** Chapter title */
  title: string

  /** Chapter summary */
  summary: string

  /** Sequential events in this chapter */
  events: StorylineEvent[]

  /** Trigger condition for this chapter to begin */
  trigger: TriggerCondition

  /** Whether this chapter is mandatory */
  required: boolean

  /** Alternative chapter IDs if this one is skipped */
  fallback_to?: string[]
}

/**
 * Volume — a major story arc, analogous to a book in a series.
 * Supports the "8 volumes" requirement.
 */
export type Volume = {
  /** Volume number (1-8+) */
  volume_number: number

  /** Volume title */
  title: string

  /** Volume subtitle */
  subtitle?: string

  /** One-paragraph summary */
  summary: string

  /** Chapters in this volume */
  chapters: Chapter[]

  /** Overall trigger condition for this volume */
  trigger: TriggerCondition

  /** Whether this volume is mandatory */
  required: boolean

  /**
   * Estimated tick range for this volume.
   * [min_tick, max_tick] — the volume is expected to play out within
   * this range. The actual timing depends on events.
   */
  estimated_tick_range: [number, number]

  /** Narrative themes for this volume */
  themes: string[]

  /** Key locations for this volume */
  key_locations: string[]

  /** Characters who are central to this volume */
  central_characters: string[]

  /** Volume status */
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

/**
 * Branching path — defines how the storyline branches based on choices.
 */
export type StorylineBranch = {
  id: string
  description: string
  condition: TriggerCondition
  target_volume_id: number    // Which volume this branch leads to
  target_chapter_id: string   // Which chapter this branch leads to
}

/**
 * StorylinePreset — the complete storyline framework for a world.
 */
export type StorylinePreset = {
  /** Unique identifier */
  id: string

  /** Storyline title (e.g. "The Shadow War of Eldoria") */
  title: string

  /** One-line genre/tone description */
  genre?: string

  /** Multi-paragraph setting and premise */
  premise: string

  /** Volumes in sequence */
  volumes: Volume[]

  /** Branching paths between volumes/chapters */
  branches: StorylineBranch[]

  /** Whether this storyline was user-defined (authoritative) */
  user_defined: boolean

  /** Tags */
  tags: string[]

  /** Global storyline effects that apply regardless of branch */
  global_effects?: StorylineEffect[]
}

/**
 * Timeline entry — a record of what happened in the simulation,
 * referenced back to the storyline framework.
 */
export type TimelineEntry = {
  /** Unique entry ID */
  id: string

  /** Tick when this entry was recorded */
  tick: number

  /** Type of timeline entry */
  type:
    | 'volume_start'
    | 'volume_end'
    | 'chapter_start'
    | 'chapter_end'
    | 'event_triggered'
    | 'character_event'
    | 'faction_event'
    | 'emergent_event'
    | 'user_intervention'

  /** Reference to the storyline element (if applicable) */
  storyline_ref?: {
    volume_number?: number
    chapter_id?: string
    event_id?: string
  }

  /** Title */
  title: string

  /** Description */
  description: string

  /** Characters involved */
  involved_characters: string[]

  /** Related branch (if this entry is part of a branch) */
  branch_id?: string

  /** Narrative tags */
  tags: string[]
}

/**
 * Factory helper: create an empty storyline preset.
 */
export function createStorylinePreset(input: {
  title: string
  premise?: string
  description?: string
  volume_count?: number
  trigger_description?: string
}): StorylinePreset {
  const volumes: Volume[] = Array.from(
    { length: input.volume_count || 1 },
    (_, i) => ({
      volume_number: i + 1,
      title: `Volume ${i + 1}`,
      summary: '',
      chapters: [],
      trigger: {
        type: i === 0 ? 'tick_threshold' : 'compound',
        params: i === 0
          ? { threshold: 0 }
          : { min_chapter_completion: 1.0 },
        operator: 'AND',
        sub_conditions: i > 0 ? [
          { type: 'tick_threshold', params: { threshold: i * 50 } },
          { type: 'event_occurred', params: { event_id: `vol-${i}-complete` } },
        ] : undefined,
      },
      required: true,
      estimated_tick_range: [i * 50, (i + 1) * 50],
      themes: [],
      key_locations: [],
      central_characters: [],
      status: i === 0 ? 'active' : 'pending',
    })
  )

  return {
    id: `storyline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: input.title,
    premise: input.premise || '',
    volumes,
    branches: [],
    user_defined: true,
    tags: [],
  }
}
