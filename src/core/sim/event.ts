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

export type SimEventEffect = {
  target_type: 'character' | 'organization' | 'region' | 'world'
  target_id: string
  field: string
  delta: number | string
  description: string
}

export type SimEventVisibility = 'public' | 'secret' | 'rumored' | 'god_only'

export type SimEvent = {
  id: string
  type: SimEventType
  title: string
  summary: string
  detail: string
  actor_ids: string[]
  target_ids: string[]
  location_region_id: string | null
  effects: SimEventEffect[]
  visibility: SimEventVisibility
  importance: number
  tick: number
  tags: string[]
  linked_event_ids: string[]
  source: 'world_director' | 'org_runner' | 'char_runner' | 'god_command' | 'consequence'
}

export function createSimEvent(
  id: string,
  type: SimEventType,
  title: string,
  tick: number,
): SimEvent {
  return {
    id,
    type,
    title,
    summary: '',
    detail: '',
    actor_ids: [],
    target_ids: [],
    location_region_id: null,
    effects: [],
    visibility: 'public',
    importance: 0.5,
    tick,
    tags: [],
    linked_event_ids: [],
    source: 'world_director',
  }
}
