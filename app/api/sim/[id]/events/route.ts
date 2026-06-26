import { NextResponse } from 'next/server'
import type { SimEvent } from '@/core/sim/event'
import { filterEvents } from '@/core/sim/event-log'
import { loadWorldSnapshot } from '@/services/persistence'

function getWorldFromRequest(searchParams: URLSearchParams): any | null {
  const encoded = searchParams.get('world')
  if (!encoded) return null

  try {
    return JSON.parse(encoded)
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const worldFromQuery = getWorldFromRequest(searchParams)
    const worldFromStorage = await loadWorldSnapshot(params.id)
    const world = worldFromQuery ?? worldFromStorage?.world_snapshot

    if (!world) {
      return NextResponse.json({ error: 'world query parameter is required or world snapshot not found' }, { status: 400 })
    }

    const typeFilter = searchParams.get('type')
    const minImportance = Number(searchParams.get('min_importance') ?? '0')
    const regionFilter = searchParams.get('region')
    const actorFilter = searchParams.get('actor')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('page_size') ?? '20')

    let events = (world.events ?? []) as SimEvent[]
    events = filterEvents(events, {
      types: typeFilter ? [typeFilter as SimEvent['type']] : undefined,
      minImportance: Number.isFinite(minImportance) && minImportance > 0 ? minImportance : undefined,
      regionId: regionFilter,
      actorId: actorFilter,
    })

    const sorted = [...events].sort((left, right) => right.tick - left.tick || right.id.localeCompare(left.id))
    const total = sorted.length
    const start = Math.max(0, (page - 1) * pageSize)
    const items = sorted.slice(start, start + pageSize)

    return NextResponse.json({
      events: items,
      total,
      page,
      page_size: pageSize,
      has_more: start + pageSize < total,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch events: ' + (error as Error).message }, { status: 500 })
  }
}
