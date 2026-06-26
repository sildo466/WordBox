import { NextResponse } from 'next/server'
import { generateWorldFromPrompt } from '@/services/llm/world-gen'
import { saveWorldSnapshot, listWorldRecords, deleteWorldRecord } from '@/services/persistence'

export async function GET() {
  try {
    const records = await listWorldRecords()
    return NextResponse.json({ worlds: records })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = typeof body.worldPrompt === 'string' ? body.worldPrompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ error: 'worldPrompt is required' }, { status: 400 })
  }

  const requestedId = typeof body.worldId === 'string' ? body.worldId : undefined

  try {
    const { world, world_state } = await generateWorldFromPrompt({ worldPrompt: prompt })
    if (requestedId) {
      world.world_id = requestedId
      world_state.id = requestedId
    }
    await saveWorldSnapshot(world.world_id, world)
    return NextResponse.json({ success: true, world, world_state })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `World generation failed: ${message}` }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const removed = await deleteWorldRecord(id)
  if (!removed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
