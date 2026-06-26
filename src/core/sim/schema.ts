export type SimEventType =
  | 'battle'
  | 'negotiation'
  | 'assassination'
  | 'disaster'
  | 'discovery'
  | 'trade'
  | 'migration'
  | 'rebellion'
  | 'alliance'
  | 'betrayal'
  | 'romance'
  | 'ritual'
  | 'rumor'
  | 'god_command'
  | 'other'

export type SimEventVisibility = 'public' | 'secret' | 'rumored' | 'god_only'

export type ConversationVisibility = 'public' | 'limited' | 'private'

export type SimEventSchema = {
  id: string
  type: SimEventType
  title: string
  summary: string
  detail: string
  actor_ids: string[]
  target_ids: string[]
  location_region_id: string | null
  visibility: SimEventVisibility
  importance: number
  tick: number
  tags: string[]
  linked_event_ids: string[]
  source: string
  effects: Array<{
    type: string
    target_id: string | null
    field: string
    delta: number | string
    note: string
  }>
}

export type ConversationSceneSchema = {
  id: string
  title: string
  summary: string
  premise: string
  tick: number
  location_region_id: string | null
  participants: Array<{
    id: string
    name: string
    role: 'speaker' | 'listener' | 'witness' | 'moderator'
    character_id: string | null
    organization_id: string | null
    mood: string
    stance: string
  }>
  lines: Array<{
    id: string
    speaker_id: string | null
    speaker_name: string
    text: string
    tone: string
    tick: number
  }>
  consequences: Array<{
    id: string
    type: 'relationship' | 'task' | 'event' | 'world_state' | 'belief' | 'other'
    summary: string
    target_ids: string[]
  }>
  related_event_ids: string[]
  visibility: ConversationVisibility
  importance: number
}

export type WorldTimeSchema = {
  tick: number
  day: number
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  year: number
  era_label: string
}

export type GlobalCrisisSchema = {
  id: string
  type: 'war' | 'plague' | 'famine' | 'disaster' | 'political' | 'economic' | 'magical' | 'other'
  name: string
  description: string
  severity: number
  affected_regions: string[]
  started_at_tick: number
  status: 'brewing' | 'active' | 'resolving' | 'resolved'
}

export type WorldStateSchema = {
  id: string
  premise: string
  language: string
  time: WorldTimeSchema
  regions: string[]
  organizations: string[]
  characters: string[]
  active_crises: GlobalCrisisSchema[]
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

const simEventTypes: SimEventType[] = [
  'battle',
  'negotiation',
  'assassination',
  'disaster',
  'discovery',
  'trade',
  'migration',
  'rebellion',
  'alliance',
  'betrayal',
  'romance',
  'ritual',
  'rumor',
  'god_command',
  'other',
]

const simEventVisibilities: SimEventVisibility[] = ['public', 'secret', 'rumored', 'god_only']
const conversationVisibilities: ConversationVisibility[] = ['public', 'limited', 'private']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export function parseSimEventType(input: string): SimEventType {
  assert(simEventTypes.includes(input as SimEventType), `Invalid sim event type: ${input}`)
  return input as SimEventType
}

export function parseSimEventVisibility(input: string): SimEventVisibility {
  assert(simEventVisibilities.includes(input as SimEventVisibility), `Invalid sim event visibility: ${input}`)
  return input as SimEventVisibility
}

export function parseConversationVisibility(input: string): ConversationVisibility {
  assert(
    conversationVisibilities.includes(input as ConversationVisibility),
    `Invalid conversation visibility: ${input}`,
  )
  return input as ConversationVisibility
}

export function parseSimEvent(input: unknown): SimEventSchema {
  assert(isRecord(input), 'SimEvent must be an object')
  assert(typeof input.id === 'string', 'SimEvent.id must be a string')
  assert(typeof input.type === 'string', 'SimEvent.type must be a string')
  assert(typeof input.title === 'string', 'SimEvent.title must be a string')
  assert(typeof input.summary === 'string', 'SimEvent.summary must be a string')
  assert(typeof input.detail === 'string', 'SimEvent.detail must be a string')
  assert(isStringArray(input.actor_ids), 'SimEvent.actor_ids must be string[]')
  assert(isStringArray(input.target_ids), 'SimEvent.target_ids must be string[]')
  assert(input.location_region_id === null || typeof input.location_region_id === 'string', 'SimEvent.location_region_id must be string | null')
  assert(typeof input.visibility === 'string', 'SimEvent.visibility must be a string')
  assert(isNumber(input.importance), 'SimEvent.importance must be a number')
  assert(isNumber(input.tick), 'SimEvent.tick must be a number')
  assert(isStringArray(input.tags), 'SimEvent.tags must be string[]')
  assert(isStringArray(input.linked_event_ids), 'SimEvent.linked_event_ids must be string[]')
  assert(typeof input.source === 'string', 'SimEvent.source must be a string')
  assert(Array.isArray(input.effects), 'SimEvent.effects must be an array')
  return {
    id: input.id as string,
    type: parseSimEventType(input.type),
    title: input.title as string,
    summary: input.summary as string,
    detail: input.detail as string,
    actor_ids: input.actor_ids as string[],
    target_ids: input.target_ids as string[],
    location_region_id: input.location_region_id as string | null,
    visibility: parseSimEventVisibility(input.visibility),
    importance: Math.max(0, Math.min(1, input.importance)),
    tick: input.tick as number,
    tags: input.tags as string[],
    linked_event_ids: input.linked_event_ids as string[],
    source: input.source as string,
    effects: input.effects as SimEventSchema['effects'],
  }
}

export function parseConversationScene(input: unknown): ConversationSceneSchema {
  assert(isRecord(input), 'ConversationScene must be an object')
  assert(typeof input.id === 'string', 'ConversationScene.id must be a string')
  assert(typeof input.title === 'string', 'ConversationScene.title must be a string')
  assert(typeof input.summary === 'string', 'ConversationScene.summary must be a string')
  assert(typeof input.premise === 'string', 'ConversationScene.premise must be a string')
  assert(isNumber(input.tick), 'ConversationScene.tick must be a number')
  assert(input.location_region_id === null || typeof input.location_region_id === 'string', 'ConversationScene.location_region_id must be string | null')
  assert(Array.isArray(input.participants), 'ConversationScene.participants must be an array')
  assert(Array.isArray(input.lines), 'ConversationScene.lines must be an array')
  assert(Array.isArray(input.consequences), 'ConversationScene.consequences must be an array')
  assert(isStringArray(input.related_event_ids), 'ConversationScene.related_event_ids must be string[]')
  assert(typeof input.visibility === 'string', 'ConversationScene.visibility must be a string')
  assert(isNumber(input.importance), 'ConversationScene.importance must be a number')
  return {
    id: input.id as string,
    title: input.title as string,
    summary: input.summary as string,
    premise: input.premise as string,
    tick: input.tick as number,
    location_region_id: input.location_region_id as string | null,
    participants: input.participants as ConversationSceneSchema['participants'],
    lines: input.lines as ConversationSceneSchema['lines'],
    consequences: input.consequences as ConversationSceneSchema['consequences'],
    related_event_ids: input.related_event_ids as string[],
    visibility: parseConversationVisibility(input.visibility),
    importance: Math.max(0, Math.min(1, input.importance)),
  }
}

export function parseWorldState(input: unknown): WorldStateSchema {
  assert(isRecord(input), 'WorldState must be an object')
  assert(typeof input.id === 'string', 'WorldState.id must be a string')
  assert(typeof input.premise === 'string', 'WorldState.premise must be a string')
  assert(typeof input.language === 'string', 'WorldState.language must be a string')
  assert(isRecord(input.time), 'WorldState.time must be an object')
  assert(isStringArray(input.regions), 'WorldState.regions must be string[]')
  assert(isStringArray(input.organizations), 'WorldState.organizations must be string[]')
  assert(isStringArray(input.characters), 'WorldState.characters must be string[]')
  assert(Array.isArray(input.active_crises), 'WorldState.active_crises must be an array')
  assert(isStringArray(input.god_commands), 'WorldState.god_commands must be string[]')
  assert(isStringArray(input.pending_events), 'WorldState.pending_events must be string[]')
  assert(typeof input.world_mood === 'string', 'WorldState.world_mood must be a string')
  assert(input.dominant_faction_id === null || typeof input.dominant_faction_id === 'string', 'WorldState.dominant_faction_id must be string | null')
  assert(input.tick_speed === 'slow' || input.tick_speed === 'normal' || input.tick_speed === 'fast' || input.tick_speed === 'paused', 'WorldState.tick_speed is invalid')
  assert(isRecord(input.config), 'WorldState.config must be an object')
  return {
    id: input.id as string,
    premise: input.premise as string,
    language: input.language as string,
    time: input.time as WorldTimeSchema,
    regions: input.regions,
    organizations: input.organizations,
    characters: input.characters,
    active_crises: input.active_crises as GlobalCrisisSchema[],
    god_commands: input.god_commands as string[],
    pending_events: input.pending_events as string[],
    world_mood: input.world_mood as string,
    dominant_faction_id: input.dominant_faction_id as string | null,
    tick_speed: input.tick_speed as WorldStateSchema['tick_speed'],
    config: input.config as WorldStateSchema['config'],
  }
}
