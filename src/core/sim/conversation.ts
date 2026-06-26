export type ConversationParticipantRole = 'speaker' | 'listener' | 'witness' | 'moderator'

export type ConversationParticipant = {
  id: string
  name: string
  role: ConversationParticipantRole
  character_id: string | null
  organization_id: string | null
  mood: string
  stance: string
}

export type ConversationLine = {
  id: string
  speaker_id: string | null
  speaker_name: string
  text: string
  tone: string
  tick: number
}

export type ConversationConsequence = {
  id: string
  type: 'relationship' | 'task' | 'event' | 'world_state' | 'belief' | 'other'
  summary: string
  target_ids: string[]
}

export type ConversationScene = {
  id: string
  title: string
  summary: string
  premise: string
  tick: number
  location_region_id: string | null
  participants: ConversationParticipant[]
  lines: ConversationLine[]
  consequences: ConversationConsequence[]
  related_event_ids: string[]
  visibility: 'public' | 'limited' | 'private'
  importance: number
}

export function createConversationScene(
  id: string,
  title: string,
  tick: number,
): ConversationScene {
  return {
    id,
    title,
    summary: '',
    premise: '',
    tick,
    location_region_id: null,
    participants: [],
    lines: [],
    consequences: [],
    related_event_ids: [],
    visibility: 'public',
    importance: 0.5,
  }
}
