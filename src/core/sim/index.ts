export type { WorldState, WorldTime, GlobalCrisis } from './world-state'
export type { Region, TerrainType, RegionResource, RegionConnection } from './region'
export type { Organization, OrganizationType, OrgGoal, OrgRelation, OrgResource } from './organization'
export type { SimCharacter, CharacterTask, CharacterDesire, CharacterRelation, CharacterStatus, CharacterPersonalityParams, CharacterCondition } from './character'
export type { SimEvent, SimEventType, SimEventEffect, SimEventVisibility } from './event'
export type { GodCommand, CommandTargetType, CommandStrength, CommandStatus, CommandConstraint } from './command'
export type {
  ConversationScene,
  ConversationParticipant,
  ConversationParticipantRole,
  ConversationLine,
  ConversationConsequence,
} from './conversation'
export type { ActiveModifier, ModifierTargetType } from './modifier'
export type { WorldFact, FactCategory } from './fact'
export type { EntityMemory, MemoryEntry } from './memory'

export {
  createWorldTime,
  createWorldState,
} from './world-state'

export {
  createRegion,
} from './region'

export {
  createOrganization,
} from './organization'

export {
  createSimCharacter,
} from './character'

export {
  createSimEvent,
} from './event'

export {
  createGodCommand,
} from './command'

export {
  createConversationScene,
} from './conversation'

export {
  parseWorldState,
  parseSimEvent,
  parseConversationScene,
  parseSimEventType,
  parseSimEventVisibility,
} from './schema'

export type { TickSnapshot, OrgSnapshot, CharSnapshot, RegionSnapshot } from './history-snapshot'
export { MAX_HISTORY_SNAPSHOTS } from './history-snapshot'

export {
  createActiveModifier,
  inferModifiersFromCommand,
  cleanupModifiers,
  formatModifiersForLLM,
} from './modifier'

export {
  createWorldFact,
  inferFactsFromCommand,
  formatFactsForLLM,
} from './fact'

export {
  createEntityMemory,
  addMemoryEntry,
  extractMemoryFromEvent,
  getRecentMemories,
  formatMemoryForLLM,
  getOrCreateMemory,
  updateMemoriesFromEvents,
} from './memory'
