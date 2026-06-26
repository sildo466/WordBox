import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createWorld,
  deleteWorld,
  getWorld,
  listWorlds,
  loadWorldSnapshot,
} from './store'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('worlds store', () => {
  it('lists worlds from API', async () => {
    const now = new Date().toISOString()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        worlds: [
          { id: 'a', worldPrompt: 'alpha', createdAt: now, updatedAt: now },
          { id: 'b', worldPrompt: 'beta', createdAt: now, updatedAt: now },
        ],
      }),
    })

    const list = await listWorlds()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('a')
    expect(mockFetch).toHaveBeenCalledWith('/api/sim')
  })

  it('returns empty array on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    await expect(listWorlds()).rejects.toThrow('Failed to list worlds')
  })

  it('gets a single world from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        world_snapshot: {
          world_id: 'test-id',
          title: 'Test World',
          summary: 'A test',
          tick: 5,
          agents: { npcs: [] },
          config: { language: 'en' },
          environment: { description: '' },
        },
      }),
    })

    const world = await getWorld('test-id')
    expect(world?.title).toBe('Test World')
    expect(world?.tick).toBe(5)
    expect(mockFetch).toHaveBeenCalledWith('/api/sim/test-id')
  })

  it('returns null when world not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const world = await getWorld('nonexistent')
    expect(world).toBeNull()
  })

  it('creates a world via API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        world: {
          world_id: 'new-id',
          title: 'New World',
          agents: { npcs: [] },
          config: { language: 'en' },
          environment: { description: '' },
        },
      }),
    })

    const record = await createWorld({ worldPrompt: 'ocean world' })
    expect(record.id).toBe('new-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/sim', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('loads a world snapshot from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        world_snapshot: {
          world_id: 'snap-id',
          title: 'Snap World',
          agents: { npcs: [] },
          config: { language: 'en' },
          environment: { description: '' },
        },
      }),
    })

    const snapshot = await loadWorldSnapshot('snap-id')
    expect(snapshot?.title).toBe('Snap World')
  })

  it('deletes a world via API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    const result = await deleteWorld('del-id')
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/api/sim/del-id', { method: 'DELETE' })
  })

  it('returns false when deleting nonexistent world', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const result = await deleteWorld('nonexistent')
    expect(result).toBe(false)
  })
})
