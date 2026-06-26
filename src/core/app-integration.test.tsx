import { describe, it, expect, vi } from 'vitest'

// Mock next/navigation redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('RootPage', () => {
  it('redirects to /sim', async () => {
    const { redirect } = await import('next/navigation')
    const { default: RootPage } = await import('../../app/page')

    // Call the component function to trigger redirect
    try { RootPage() } catch { /* redirect throws in some contexts */ }
    expect(redirect).toHaveBeenCalledWith('/sim')
  })
})
