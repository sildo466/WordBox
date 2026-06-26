import React from 'react'
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorldDetailPage from '../../app/sim/[id]/page'
import { useParams } from 'next/navigation'

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

it('renders world detail page with loading state', () => {
  vi.mocked(useParams).mockReturnValue({ id: 'test-id' })
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'not found' }),
  })

  render(<WorldDetailPage />)
  expect(screen.getByText(/加载中/i)).toBeTruthy()
})
