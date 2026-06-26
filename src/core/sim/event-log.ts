import type { SimEvent } from '@/core/sim/event'

export type EventLogFilters = {
  types?: SimEvent['type'][]
  minImportance?: number
  regionId?: string | null
  actorId?: string | null
}

const MAX_EVENTS = 200

/**
 * 去重：相同 title + 相同 tick 的事件只保留一条
 */
function deduplicateEvents(events: SimEvent[]): SimEvent[] {
  const seen = new Set<string>()
  return events.filter(event => {
    const key = `${event.title}_${event.tick}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function appendEvents(existingEvents: SimEvent[], newEvents: SimEvent[]): SimEvent[] {
  const merged = [...existingEvents, ...newEvents].sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id))
  const deduped = deduplicateEvents(merged)
  if (deduped.length <= MAX_EVENTS) return deduped
  // When trimming, always keep god_command events + the most recent events
  const godCommandEvents = deduped.filter(e => e.type === 'god_command' || e.source === 'god_command')
  const otherEvents = deduped.filter(e => e.type !== 'god_command' && e.source !== 'god_command')
  const remaining = MAX_EVENTS - godCommandEvents.length
  return [...godCommandEvents, ...otherEvents.slice(-Math.max(50, remaining))]
}

export function filterEvents(events: SimEvent[], filters: EventLogFilters = {}): SimEvent[] {
  return events.filter(event => {
    if (filters.types && filters.types.length > 0 && !filters.types.includes(event.type)) {
      return false
    }

    if (typeof filters.minImportance === 'number' && event.importance < filters.minImportance) {
      return false
    }

    if (filters.regionId && event.location_region_id !== filters.regionId) {
      return false
    }

    if (filters.actorId && !event.actor_ids.includes(filters.actorId)) {
      return false
    }

    return true
  })
}

export function groupEventsByType(events: SimEvent[]): Record<string, SimEvent[]> {
  return events.reduce<Record<string, SimEvent[]>>((groups, event) => {
    const bucket = groups[event.type] ?? []
    bucket.push(event)
    groups[event.type] = bucket
    return groups
  }, {})
}
