export type CommandTargetType = 'character' | 'organization' | 'region' | 'world'

export type CommandStrength = 'suggestion' | 'order' | 'divine_decree'

export type CommandStatus =
  | 'pending'
  | 'parsed'
  | 'executing'
  | 'completed'
  | 'refused'
  | 'failed'

export type CommandConstraint = {
  type: 'no_kill' | 'peaceful_only' | 'secret' | 'within_region' | 'custom'
  description: string
}

export type GodCommand = {
  id: string
  raw_input: string
  parsed_intent: string
  target_type: CommandTargetType
  target_id: string | null
  target_name: string
  strength: CommandStrength
  constraints: CommandConstraint[]
  status: CommandStatus
  issued_at_tick: number
  resolved_at_tick: number | null
  feedback: string
  generated_event_ids: string[]
  refusal_reason: string | null

  // Multi-tick execution tracking
  estimated_ticks: number
  progress: number
  total_ticks_worked: number
  intermediate_results: string[]

  // Narrative plan — LLM-generated multi-stage story for this command
  narrative_plan: string[]
}

export function createGodCommand(id: string, raw_input: string, tick: number): GodCommand {
  return {
    id,
    raw_input,
    parsed_intent: '',
    target_type: 'world',
    target_id: null,
    target_name: '',
    strength: 'order',
    constraints: [],
    status: 'pending',
    issued_at_tick: tick,
    resolved_at_tick: null,
    feedback: '',
    generated_event_ids: [],
    refusal_reason: null,
    estimated_ticks: 1,
    progress: 0,
    total_ticks_worked: 0,
    intermediate_results: [],
    narrative_plan: [],
  }
}
