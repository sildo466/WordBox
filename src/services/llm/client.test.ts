import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock OpenAI SDK
const mockCreate = vi.fn().mockResolvedValue({
  choices: [{ message: { content: 'test response' } }],
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
  },
}))

describe('LLM client module', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreate.mockClear()
  })

  it('createLLMClient returns a client instance', async () => {
    const { createLLMClient } = await import('./client')
    const client = createLLMClient()
    expect(client).toBeDefined()
  })

  it('getModel returns a string', async () => {
    const { getModel } = await import('./client')
    const model = getModel()
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })

  it('callLLM returns response text', async () => {
    const { createLLMClient, callLLM } = await import('./client')
    const client = createLLMClient()
    const result = await callLLM(client, {
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result).toBe('test response')
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
    })
  })

  it('callLLM returns empty string on null response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    })
    const { createLLMClient, callLLM } = await import('./client')
    const client = createLLMClient()
    const result = await callLLM(client, {
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result).toBe('')
  })
})
