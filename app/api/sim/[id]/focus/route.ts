import { NextResponse } from 'next/server'
import type { SimEvent } from '@/core/sim/event'
import { buildFocusQuery } from '@/core/sim/focus-query'
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
    const entityId = searchParams.get('entity_id')

    if (!world) {
      return NextResponse.json({ error: 'world query parameter is required or world snapshot not found' }, { status: 400 })
    }

    if (!entityId) {
      return NextResponse.json({ error: 'entity_id is required' }, { status: 400 })
    }

    const focus = buildFocusQuery(world, entityId, (world.events ?? []) as SimEvent[])

    return NextResponse.json({
      focus,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch focus: ' + (error as Error).message }, { status: 500 })
  }
}
