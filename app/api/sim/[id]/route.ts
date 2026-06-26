import { NextResponse } from 'next/server'
import { loadWorldSnapshot, deleteWorldRecord } from '@/services/persistence'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const snapshot = await loadWorldSnapshot(params.id)
    if (!snapshot) {
      return NextResponse.json({ error: 'World not found' }, { status: 404 })
    }
    return NextResponse.json({
      world_snapshot: snapshot.world_snapshot,
      world_state: snapshot.world_state,
    })
  } catch (error) {
    console.error('Failed to load world:', error)
    return NextResponse.json(
      { error: 'Failed to load world: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteWorldRecord(params.id)
    if (!deleted) {
      return NextResponse.json({ error: 'World not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete world:', error)
    return NextResponse.json(
      { error: 'Failed to delete world: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
