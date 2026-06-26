import type { GodCommand } from '@/core/sim/command'

export function buildCommandFeedback(command: GodCommand, result: 'completed' | 'refused' | 'failed' = 'completed'): string {
  if (result === 'refused') {
    return `Command refused: ${command.raw_input}`
  }

  if (result === 'failed') {
    return `Command failed: ${command.raw_input}`
  }

  return command.feedback || `Command completed for ${command.target_name || command.target_type}.`
}
