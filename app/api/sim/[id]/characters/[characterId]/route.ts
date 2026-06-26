import { NextRequest, NextResponse } from 'next/server'
import { loadWorldSnapshot } from '@/services/persistence'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; characterId: string } },
) {
  try {
    const snapshot = await loadWorldSnapshot(params.id)
    if (!snapshot) {
      return NextResponse.json({ error: 'World not found' }, { status: 404 })
    }

    const world = snapshot.world_snapshot ?? snapshot.world_state
    const w = world as any
    const chars: any[] = w.characters ?? []
    const char = chars.find((c: any) => c.id === params.characterId)

    if (!char) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Include recent events involving this character
    const events: any[] = w.events ?? []
    const recentEvents = events
      .filter((e: any) =>
        (e.actor_ids ?? []).includes(params.characterId) ||
        (e.target_ids ?? []).includes(params.characterId)
      )
      .slice(-20)

    // Include organization info
    const orgs: any[] = w.organizations ?? w.factions ?? []
    const org = orgs.find((o: any) => o.id === (char.organization_id ?? char.faction_id))

    return NextResponse.json({
      character: char,
      organization: org ?? null,
      recent_events: recentEvents,
    })
  } catch (error) {
    console.error('[character-api] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
