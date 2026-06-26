import type { WorldMeta } from '@/core/world'
import type { WorldSnapshot } from '@/core/world'

// Re-export so existing imports from '@/store/worlds' still resolve

const API_BASE = '/api/sim'

export async function listWorlds(): Promise<WorldMeta[]> {
  const res = await fetch(API_BASE)
  if (!res.ok) throw new Error('Failed to list worlds')
  const data = await res.json()
  return data.worlds ?? []
}

export async function getWorld(id: string): Promise<WorldMeta | null> {
  const res = await fetch(`${API_BASE}/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  // The GET endpoint returns { world_snapshot, world_state } — derive a WorldMeta
  if (!data.world_snapshot) return null
  const slice = data.world_snapshot as WorldSnapshot
  return {
    id,
    worldPrompt: (slice as any).config?.worldPrompt ?? '',
    title: slice.title,
    summary: slice.summary,
    tick: slice.tick,
    characterCount: (slice as any).characters?.length ?? 0,
    factionCount: (slice as any).factions?.length ?? 0,
    agentCount: slice.agents?.npcs?.length ?? 0,
    eventCount: (slice as any).events?.length ?? 0,
    lastSnapshotAt: new Date().toISOString(),
    storageVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function createWorld(input: { worldPrompt: string }): Promise<WorldMeta> {
  // POST /api/sim generates and persists the world server-side
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create world')
  }
  const data = await res.json()
  const world = data.world as WorldSnapshot
  return {
    id: world.world_id,
    worldPrompt: input.worldPrompt,
    title: world.title,
    summary: world.summary,
    tick: world.tick,
    characterCount: (world as any).characters?.length ?? 0,
    factionCount: (world as any).factions?.length ?? 0,
    agentCount: world.agents?.npcs?.length ?? 0,
    eventCount: (world as any).events?.length ?? 0,
    lastSnapshotAt: new Date().toISOString(),
    storageVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function loadWorldSnapshot(id: string): Promise<WorldSnapshot | null> {
  const res = await fetch(`${API_BASE}/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return (data.world_snapshot as WorldSnapshot) ?? null
}

export async function deleteWorld(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
  return res.ok
}
