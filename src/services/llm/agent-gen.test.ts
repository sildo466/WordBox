import { describe, it, expect, vi } from 'vitest'
import { generateSingleAgent } from './agent-gen'
import type { CharacterSpec } from '@/core/character'

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  character: {
                    id: 'brave-explorer',
                    name: '勇敢探索者',
                    traits: { openness: 0.8, stability: 0.6, attachment: 0.5, agency: 0.7, empathy: 0.6 },
                    condition: { energy: 0.8, stress: 0.2, sleep_debt: 0.1, focus: 0.7, aging_index: 0.1 },
                    history: '一位经验丰富的探险家',
                    goals: ['探索未知领域', '找到传说中的宝藏'],
                    occupation: 'explorer',
                    voice: '沉稳有力',
                    approach: '谨慎但果断',
                    expertise: ['navigation', 'survival'],
                    philosophy: '勇气是最重要的品质',
                    location: 'r1',
                  },
                  bonds: [],
                }),
              },
            }],
          }),
        },
      }
    },
  }
})

describe('generateSingleAgent', () => {
  it('generates a single agent from character spec', async () => {
    const spec: CharacterSpec = {
      id: 'char-1',
      origin: 'user_defined',
      name: '勇敢探索者',
      story_role: 'protagonist',
      description: '一位经验丰富的探险家',
      core_beliefs: ['勇气是最重要的品质'],
      initial_goals: ['探索未知领域'],
      relationships: {},
      expertise: ['navigation', 'survival'],
      tags: ['explorer'],
      initial_life_status: 'alive',
    }

    const agent = await generateSingleAgent({
      characterSpec: spec,
      worldContext: 'A medieval fantasy world full of mystery.',
      existingAgents: [],
      allFactionNames: [],
    })

    expect(agent.id).toBeTruthy()
    expect(agent.name).toBe('勇敢探索者')
    expect(agent.kind).toBe('personal')
    expect(agent.traits).toBeDefined()
    expect(agent.condition).toBeDefined()
  })
})
