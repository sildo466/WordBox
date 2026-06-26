import type { GodCommand } from '@/core/sim/command'

export type WorldWithCommands = {
  god_commands?: GodCommand[]
  characters?: Array<{ name?: string }>
  factions?: Array<{ name?: string }>
  regions?: Array<{ name?: string }>
  environment?: { geography?: string; description?: string }
  config?: { description?: string }
  tick?: number
}

export function appendCommand(world: WorldWithCommands, command: GodCommand): WorldWithCommands {
  return {
    ...world,
    god_commands: [...(world.god_commands ?? []), command],
  }
}
