import type { SimAgent } from './world'

export type DirectorRole = 'tick' | 'macro' | 'rules' | 'other'

export type PatchEvent = {
  id: string
  kind: 'macro' | 'micro'
  summary: string
  conflict?: boolean
}

export type RuleChange = {
  key: string
  value: string
}

export type TickPatch = {
  timeDelta?: number
  events?: PatchEvent[]
  rulesDelta?: RuleChange[]
  notes?: string[]
  meta?: Record<string, unknown>
}

export type TickDirector = {
  id: string
  role: DirectorRole
  run: (world: unknown) => Promise<TickPatch> | TickPatch
}

export const createTickPatch = (patch: TickPatch): Required<TickPatch> => ({
  timeDelta: patch.timeDelta ?? 0,
  events: patch.events ?? [],
  rulesDelta: patch.rulesDelta ?? [],
  notes: patch.notes ?? [],
  meta: patch.meta ?? {},
})

export function createCharacter(id: string): SimAgent {
  return {
    kind: 'personal',
    id,
    name: id,
    short_term: [],
    long_term: [],
    condition: {
      energy: 0.65,
      stress: 0.25,
      sleep_debt: 0.15,
      focus: 0.55,
      aging_index: 0.05,
    },
    emotion: { label: 'calm', intensity: 0.15 },
    traits: {
      openness: 0.55,
      stability: 0.45,
      attachment: 0.5,
      agency: 0.5,
      empathy: 0.5,
    },
    goals: [],
    relations: {},
    history: [],
    life_status: 'alive',
  }
}
