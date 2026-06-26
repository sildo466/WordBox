import { NextResponse } from 'next/server'
import { runSimulationTick } from '@/core/sim/tick'
import type { WorldSnapshot, WorldState } from '@/core/world'
import { loadWorldSnapshot, saveWorldSnapshot } from '@/services/persistence'

type TickRouteBody = {
  world?: WorldSnapshot | WorldState
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await request.json().catch(() => ({})) // consume body but ignore it
    const snapshot = await loadWorldSnapshot(params.id)
    const world = snapshot?.world_snapshot ?? snapshot?.world_state

    if (!world) {
      return NextResponse.json({ error: 'world not found' }, { status: 404 })
    }

    const result = await runSimulationTick({ world })
    const saved = await saveWorldSnapshot(params.id, result.world)

    return NextResponse.json({
      world: saved.world_snapshot,
      world_state: saved.world_state,
      new_events: result.new_events,
      tick_narrative: result.tick_narrative,
      new_world_mood: result.new_world_mood,
    })
  } catch (error) {
    console.error('Failed to run simulation tick:', error)
    return NextResponse.json(
      { error: 'Failed to run simulation tick: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
