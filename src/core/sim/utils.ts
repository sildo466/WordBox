import type { SimEvent, SimEventEffect, SimEventType } from '@/core/sim/event'
import { createSimEvent } from '@/core/sim/event'

export function generateSimulationId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createSimulationEvent(
  raw: {
    type: SimEventType
    title: string
    summary: string
    detail: string
    actor_ids?: string[]
    target_ids?: string[]
    location_region_id?: string | null
    importance?: number
    effects?: SimEventEffect[]
    tags?: string[]
  },
  tick: number,
  source: SimEvent['source'],
): SimEvent {
  const event = createSimEvent(generateSimulationId('evt'), raw.type, raw.title, tick)
  event.summary = raw.summary
  event.detail = raw.detail
  event.actor_ids = raw.actor_ids ?? []
  event.target_ids = raw.target_ids ?? []
  event.location_region_id = raw.location_region_id ?? null
  event.importance = Math.max(0, Math.min(1, raw.importance ?? 0.5))
  event.effects = raw.effects ?? []
  event.tags = raw.tags ?? []
  event.source = source
  return event
}
