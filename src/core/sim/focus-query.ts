import type { SimEvent } from '@/core/sim/event'
import type { WorldState } from '@/core/sim/world-state'
import { filterEvents } from './event-log'

export type FocusQueryResult = {
  entityId: string
  currentState: string
  recentEvents: SimEvent[]
  notes: string[]
}

export function buildFocusQuery(world: WorldState, entityId: string, events: SimEvent[] = []): FocusQueryResult {
  const relatedEvents = filterEvents(events, {
    actorId: entityId,
  }).slice(-10)

  return {
    entityId,
    currentState: world.world_mood,
    recentEvents: relatedEvents,
    notes: [
      `Entity ${entityId} is in world mood ${world.world_mood}`,
      `Recent related events: ${relatedEvents.length}`,
    ],
  }
}
