import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import WorldsPage from '../../app/sim/page'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorldsPage', () => {
  it('shows the empty state and create link when no worlds exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ worlds: [] }),
    })

    render(<WorldsPage />)

    await waitFor(() => {
      expect(screen.getByText(/还没有世界/i)).toBeTruthy()
    })

    const links = screen.getAllByRole('link', { name: /创建新世界/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(links[0].getAttribute('href')).toBe('/sim/new')
  })

  it('lists existing worlds with prompt and created time', async () => {
    const now = new Date().toISOString()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        worlds: [{
          id: 'test-id',
          worldPrompt: 'Oceanic shelter',
          tick: 0,
          createdAt: now,
          updatedAt: now,
        }],
      }),
    })

    render(<WorldsPage />)

    await waitFor(() => {
      expect(screen.getByText('Oceanic shelter')).toBeTruthy()
    })
  })
})
