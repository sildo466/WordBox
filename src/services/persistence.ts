import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  snapshotToWorldState,
  worldStateToSnapshot,
} from '@/core/world'
import type { WorldSnapshot, WorldState, WorldMeta } from '@/core/world'

const WORLD_DATA_DIR = path.resolve(process.cwd(), 'data', 'worlds')
const WORLD_INDEX_PATH = path.resolve(process.cwd(), 'data', 'worlds-index.json')

type PersistedWorldSnapshot = {
  schema_version: 2
  world_id: string
  updated_at: string
  world_snapshot: WorldSnapshot
  world_state: WorldState
}

function worldDataPath(worldId: string): string {
  return path.join(WORLD_DATA_DIR, `${worldId}.json`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWorldState(world: unknown): world is WorldState {
  if (!isRecord(world)) return false
  if (!isRecord(world.time)) return false

  return (
    typeof world.id === 'string'
    && typeof world.premise === 'string'
    && Array.isArray(world.regions)
    && Array.isArray(world.organizations)
    && Array.isArray(world.characters)
    && typeof world.world_mood === 'string'
    && typeof world.time.tick === 'number'
  )
}

function isWorldSnapshot(world: unknown): world is WorldSnapshot {
  if (!isRecord(world)) return false

  return (
    typeof world.world_id === 'string'
    && typeof world.tick === 'number'
    && isRecord(world.environment)
    && typeof world.environment.description === 'string'
    && isRecord(world.config)
    && typeof world.config.language === 'string'
  )
}

function normalizeSnapshot(worldId: string, world: WorldSnapshot | WorldState): PersistedWorldSnapshot {
  const worldState = isWorldState(world)
    ? world
    : snapshotToWorldState(world)
  const worldSnapshot = isWorldSnapshot(world)
    ? world
    : worldStateToSnapshot(world)

  // Preserve runtime simulation state (modifiers, facts, history) across save/load
  const sliceWithState = {
    ...worldSnapshot,
    world_id: worldId,
    _modifiers: (world as any)._modifiers ?? (worldSnapshot as any)._modifiers ?? [],
    _facts: (world as any)._facts ?? (worldSnapshot as any)._facts ?? [],
    history_snapshots: (world as any).history_snapshots ?? (worldSnapshot as any).history_snapshots ?? [],
    _narrative_thread: (world as any)._narrative_thread ?? (worldSnapshot as any)._narrative_thread ?? '',
    _formula_history: (world as any)._formula_history ?? (worldSnapshot as any)._formula_history ?? [],
    _coalitions: (world as any)._coalitions ?? (worldSnapshot as any)._coalitions ?? [],
    _tensions: (world as any)._tensions ?? (worldSnapshot as any)._tensions ?? [],
    _ideologies: (world as any)._ideologies ?? (worldSnapshot as any)._ideologies ?? [],
    _knowledge_graph: (world as any)._knowledge_graph ?? (worldSnapshot as any)._knowledge_graph ?? null,
  }

  return {
    schema_version: 2,
    world_id: worldId,
    updated_at: new Date().toISOString(),
    world_snapshot: sliceWithState as WorldSnapshot,
    world_state: {
      ...worldState,
      id: worldId,
    },
  }
}

async function writeSnapshot(snapshot: PersistedWorldSnapshot): Promise<void> {
  await fs.mkdir(WORLD_DATA_DIR, { recursive: true })
  await fs.writeFile(worldDataPath(snapshot.world_id), JSON.stringify(snapshot, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// World index — lightweight metadata for listing worlds without loading snapshots
// ---------------------------------------------------------------------------


function deriveWorldRecord(worldId: string, snapshot: PersistedWorldSnapshot): WorldMeta {
  const slice = snapshot.world_snapshot
  return {
    id: worldId,
    worldPrompt: (slice.config as any)?.worldPrompt ?? '',
    title: slice.title,
    summary: slice.summary,
    tick: slice.tick,
    characterCount: (slice as any).characters?.length ?? slice.agents?.npcs?.length ?? 0,
    factionCount: (slice as any).factions?.length ?? 0,
    agentCount: slice.agents?.npcs?.length ?? 0,
    eventCount: (slice as any).events?.length ?? 0,
    lastSnapshotAt: snapshot.updated_at,
    storageVersion: 2,
    createdAt: snapshot.updated_at,
    updatedAt: snapshot.updated_at,
  }
}

async function readIndex(): Promise<WorldMeta[]> {
  try {
    const raw = await fs.readFile(WORLD_INDEX_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as WorldMeta[] : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeIndex(records: WorldMeta[]): Promise<void> {
  await fs.mkdir(path.dirname(WORLD_INDEX_PATH), { recursive: true })
  await fs.writeFile(WORLD_INDEX_PATH, JSON.stringify(records, null, 2), 'utf-8')
}

export async function listWorldRecords(): Promise<WorldMeta[]> {
  const records = await readIndex()
  return records.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getWorldRecord(id: string): Promise<WorldMeta | null> {
  const records = await readIndex()
  return records.find((r) => r.id === id) ?? null
}

export async function upsertWorldRecord(record: WorldMeta): Promise<void> {
  const records = await readIndex()
  const index = records.findIndex((r) => r.id === record.id)
  if (index === -1) {
    records.unshift(record)
  } else {
    records[index] = record
  }
  await writeIndex(records)
}

export async function deleteWorldRecord(id: string): Promise<boolean> {
  const records = await readIndex()
  const filtered = records.filter((r) => r.id !== id)
  if (filtered.length === records.length) return false
  await writeIndex(filtered)

  // Also delete the snapshot file
  try {
    await fs.unlink(worldDataPath(id))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return true
}

/**
 * Rebuild the index from all snapshot files on disk.
 * Useful for migration or recovery.
 */
export async function rebuildWorldIndex(): Promise<WorldMeta[]> {
  try {
    await fs.mkdir(WORLD_DATA_DIR, { recursive: true })
    const files = await fs.readdir(WORLD_DATA_DIR)
    const records: WorldMeta[] = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const worldId = file.replace(/\.json$/, '')
      const snapshot = await readSnapshot(worldId)
      if (snapshot) {
        records.push(deriveWorldRecord(worldId, snapshot))
      }
    }

    await writeIndex(records)
    return records
  } catch {
    return []
  }
}

async function readSnapshot(worldId: string): Promise<PersistedWorldSnapshot | null> {
  try {
    const contents = await fs.readFile(worldDataPath(worldId), 'utf-8')
    const parsed = JSON.parse(contents) as unknown

    if (!isRecord(parsed)) return null

    if (isWorldSnapshot(parsed)) {
      return normalizeSnapshot(worldId, parsed)
    }

    const snap = parsed.world_snapshot
    const st = parsed.world_state

    if (isRecord(snap) && isRecord(st)) {
      return {
        schema_version: 2,
        world_id: worldId,
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : new Date().toISOString(),
        world_snapshot: {
          ...(snap as WorldSnapshot),
          world_id: worldId,
        },
        world_state: {
          ...(st as WorldState),
          id: worldId,
        },
      }
    }

    if (isRecord(snap) && isWorldSnapshot(snap)) {
      return normalizeSnapshot(worldId, snap)
    }

    if (isRecord(parsed.world_state) && isWorldState(parsed.world_state)) {
      return normalizeSnapshot(worldId, parsed.world_state)
    }

    return null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function loadPersistedSnapshot(worldId: string): Promise<PersistedWorldSnapshot | null> {
  return readSnapshot(worldId)
}

export async function saveWorldSnapshot(worldId: string, world: WorldSnapshot | WorldState): Promise<PersistedWorldSnapshot> {
  // Backfill before saving so persisted data is complete
  if (isWorldSnapshot(world)) {
    backfillSnapshotData(world)
  }
  const snapshot = normalizeSnapshot(worldId, world)
  await writeSnapshot(snapshot)

  // Update the world index so listing works without loading snapshots
  const record = deriveWorldRecord(worldId, snapshot)
  await upsertWorldRecord(record)

  return snapshot
}

export async function loadWorldSnapshot(worldId: string): Promise<PersistedWorldSnapshot | null> {
  const snapshot = await loadPersistedSnapshot(worldId)
  if (snapshot?.world_snapshot) {
    backfillSnapshotData(snapshot.world_snapshot)
  }
  return snapshot
}

/**
 * Backfill missing fields on old worlds so the simulation pipeline works.
 */
function backfillSnapshotData(world: WorldSnapshot): void {
  const w = world as any

  // Ensure god_commands exists
  if (!Array.isArray(w.god_commands)) {
    w.god_commands = []
  }

  // Build faction lookup for description backfill
  const factionMap = new Map<string, any>()
  if (Array.isArray(w.factions)) {
    for (const f of w.factions) {
      factionMap.set(f.id, f)
      factionMap.set(f.name, f)
    }
  }

  // Backfill organizations
  if (Array.isArray(w.organizations) && w.organizations.length > 0) {
    for (const org of w.organizations) {
      if (org.military_strength == null) org.military_strength = 30
      if (org.economic_power == null) org.economic_power = 30
      if (org.cohesion == null) org.cohesion = 0.5
      if (org.public_reputation == null) org.public_reputation = org.public_perception ?? 0
      if (org.public_perception == null) org.public_perception = org.public_reputation ?? 0
      if (org.resources == null) org.resources = 20
      if (!org.description) {
        const faction = factionMap.get(org.id) || factionMap.get(org.name)
        org.description = faction?.history || faction?.description || ''
      }
      if (!org.type) org.type = org.category ?? 'other'
      if (!org.status) org.status = 'stable'
    }
  } else if (Array.isArray(w.factions) && w.factions.length > 0) {
    // Create organizations from factions
    w.organizations = w.factions.map((f: any) => ({
      id: f.id,
      name: f.name,
      description: f.description || f.history || '',
      type: f.category || 'other',
      status: f.status || 'stable',
      influence_score: f.influence_score ?? 50,
      military_strength: f.military_strength ?? 30,
      economic_power: f.economic_power ?? 30,
      cohesion: f.cohesion ?? 0.5,
      public_reputation: f.public_perception ?? f.public_reputation ?? 0,
      resources: f.resources ?? 20,
      ideology: f.ideology || '',
    }))
  }

  // Backfill regions
  if (Array.isArray(w.regions) && w.regions.length > 0) {
    for (const region of w.regions) {
      if (!region.description) region.description = ''
      if (region.prosperity == null) region.prosperity = 0.5
      if (region.population == null) region.population = 'moderate'
      if (!region.terrain) region.terrain = 'plains'
    }
  }
}

export async function saveWorldState(world: WorldState): Promise<void> {
  await saveWorldSnapshot(world.id, world)
}

export async function loadWorldState(worldId = 'world-1'): Promise<WorldState | null> {
  const snapshot = await loadPersistedSnapshot(worldId)
  return snapshot?.world_state ?? null
}

export async function saveSnapshot(world: WorldSnapshot): Promise<void> {
  await saveWorldSnapshot(world.world_id, world)
}

export async function loadSnapshot(worldId = 'world-1'): Promise<WorldSnapshot | null> {
  const snapshot = await loadPersistedSnapshot(worldId)
  return snapshot?.world_snapshot ?? null
}
