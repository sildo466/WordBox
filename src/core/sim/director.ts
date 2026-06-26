import type { WorldState } from '@/core/sim/world-state'
import type { SimEvent } from '@/core/sim/event'
import type { TickContext } from './tick-context'

export type WorldDirectorResult = {
  events: SimEvent[]
  worldMood: string
  summary: string
}

/**
 * 世界导演 — 现在只负责根据世界状态决定 mood
 * 不再生成随机事件（由数学引擎和 LLM 分别负责）
 */
export function runWorldDirector(world: WorldState, context: TickContext): WorldDirectorResult {
  const mood = pickMood(world.world_mood, context)
  const zh = context.language === 'zh'

  return {
    events: [],
    worldMood: mood,
    summary: zh ? `世界基调转为「${mood}」` : `World mood shifts to ${mood}`,
  }
}

function pickMood(currentMood: string, context: TickContext): string {
  // 基于世界状态决定 mood，而不是随机
  const dangerRegions = context.regions.filter(r => r.danger_level >= 60)
  const decliningOrgs = context.organizations.filter(o => o.status === 'declining' || o.status === 'collapsed')

  if (dangerRegions.length >= 2) return 'grim'
  if (decliningOrgs.length >= 2) return 'tense'
  if (dangerRegions.length >= 1) return 'tense'

  // 保持当前 mood，除非有明确理由改变
  return currentMood || 'calm'
}
