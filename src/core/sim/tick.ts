import type { WorldSnapshot } from '@/core/world'
import type { WorldState } from '@/core/sim/world-state'
import type { SimEvent, SimEventEffect } from '@/core/sim/event'
import type { GodCommand } from '@/core/sim/command'
import type { ActiveModifier } from '@/core/sim/modifier'
import type { WorldFact } from '@/core/sim/fact'
import type { EntityMemory } from '@/core/sim/memory'
import { snapshotToWorldState, worldStateToSnapshot } from '@/core/world'
import { createWorldTime } from '@/core/sim/world-state'
import { createSimEvent } from '@/core/sim/event'
import { inferModifiersFromCommand, cleanupModifiers } from '@/core/sim/modifier'
import { inferFactsFromCommand } from '@/core/sim/fact'
import { updateMemoriesFromEvents, formatMemoryForLLM, getOrCreateMemory } from '@/core/sim/memory'
import { generateTickEvents } from '@/services/llm/tick-gen'
import { generateCombinedEvents } from '@/services/llm/combined-agent'
import { generateFormulaAdjustments, shouldTriggerFormulaAgent } from '@/services/llm/formula-agent'
import { buildTickContext } from './tick-context'
import { runMathEngine, applyPersonalityDrift } from './math'
import { applyConsequences } from './consequence'
import { appendEvents } from './event-log'
import { recordSnapshot } from './history-tracker'
import { evolveCoalitions, checkCoalitionFormation, formatCoalitionsForLLM } from './coalition'
import { evolveTensions, checkTensionTriggers, formatTensionsForLLM, calcGlobalTension } from './tension-system'
import { recordOrgMemory, formatOrgMemoryForLLM } from './org-memory'
import { applyReputationEvent, formatReputationForLLM } from './org-reputation'
import { generateStrategicAnalysis, formatStrategicAnalysisForLLM } from './strategic-analysis'
import { allocateAttention, buildAttentionTargets, updateAttentionFatigue, formatAttentionForLLM } from './org-attention'
import { syncKnowledgeGraph, formatKnowledgeGraphForLLM } from './org-knowledge-graph'
import { propagateIdeology, decayIdeologyImmunity, formatIdeologiesForLLM } from './ideology-propagation'

export type WorldTickInput = {
  world: WorldSnapshot | WorldState
  pendingCommands?: GodCommand[]
}

export type WorldTickOutput = {
  world: WorldSnapshot | WorldState
  new_events: SimEvent[]
  resolved_commands: GodCommand[]
  tick_narrative: string
  new_world_mood: string
}

function isWorldState(world: WorldSnapshot | WorldState): world is WorldState {
  const candidate = world as Partial<WorldState> & { world_id?: string }
  const time = candidate.time as { tick?: number } | undefined

  return (
    typeof candidate.id === 'string'
    && typeof candidate.premise === 'string'
    && typeof time?.tick === 'number'
    && typeof candidate.world_id !== 'string'
  )
}

function toWorldState(world: WorldSnapshot | WorldState): WorldState {
  if (isWorldState(world)) {
    return world
  }

  return snapshotToWorldState(world)
}

function mergeWorldSnapshot(
  world: WorldSnapshot,
  nextTick: number,
  events: SimEvent[],
  nextMood: string,
  resolvedCommands: GodCommand[],
  consequenceWorld: WorldSnapshot,
): WorldSnapshot {
  const existingCommands = (world as WorldSnapshot & { god_commands?: GodCommand[] }).god_commands ?? []
  const nextCommands = [
    ...existingCommands.filter(command => !resolvedCommands.some(resolved => resolved.id === command.id)),
    ...resolvedCommands,
  ]

  return {
    ...consequenceWorld,
    tick: nextTick,
    time: new Date(nextTick * 1000).toISOString(),
    events: appendEvents((world.events ?? []) as unknown as SimEvent[], events),
    world_mood: nextMood,
    god_commands: nextCommands,
  } as unknown as WorldSnapshot & { world_mood?: string; events?: SimEvent[] }
}

/**
 * Backfill missing fields on old worlds so the simulation pipeline works.
 */
function backfillWorldData(world: WorldSnapshot): void {
  const w = world as any

  // Ensure god_commands exists
  if (!Array.isArray(w.god_commands)) {
    w.god_commands = []
  }

  // Ensure organizations exist (copy from factions if needed)
  if (!Array.isArray(w.organizations) || w.organizations.length === 0) {
    const factions = w.factions ?? []
    w.organizations = factions.map((f: any) => ({
      id: f.id,
      name: f.name,
      description: f.description || f.history || '',
      type: f.category || 'other',
      status: f.status || 'stable',
      influence_score: f.influence_score ?? 50,
      military_strength: f.military_strength ?? 30,
      economic_power: f.economic_power ?? 30,
      cohesion: f.cohesion ?? 70,
      public_reputation: f.public_perception ?? f.public_reputation ?? 50,
      resources: f.resources ?? 20,
      ideology: f.ideology || (f.core_values || []).join('、'),
      goals: f.goals || [],
      relations: f.relations || [],
      territory: f.territory ? (Array.isArray(f.territory) ? f.territory : [f.territory]) : [],
    }))
  } else {
    // Backfill missing fields on existing organizations
    const factionLookup = new Map<string, any>()
    for (const f of (w.factions ?? [])) {
      factionLookup.set(f.id, f)
      factionLookup.set(f.name, f)
    }
    for (const org of w.organizations) {
      if (org.military_strength == null) org.military_strength = 30
      if (org.economic_power == null) org.economic_power = 30
      if (org.cohesion == null) org.cohesion = 70
      if (org.public_reputation == null) org.public_reputation = org.public_perception ?? 50
      if (org.resources == null) org.resources = 20
      if (!org.description) {
        const faction = factionLookup.get(org.id) || factionLookup.get(org.name)
        org.description = faction?.history || faction?.description || ''
      }
      if (!org.type) org.type = org.category ?? 'other'
      if (!org.status) org.status = 'stable'
    }
  }

  // Ensure regions exist
  if (!Array.isArray(w.regions) || w.regions.length === 0) {
    const locationHints = (w.environment?.description || '').match(/[一-鿿]+(?:之地|王国|帝国|大陆|森林|山脉|沙漠|海岸|城市|城镇|村庄)/g) || []
    if (locationHints.length > 0) {
      w.regions = locationHints.slice(0, 4).map((name: string, i: number) => ({
        id: `region-${i + 1}`,
        name,
        description: `${name}，位于这片大陆上。`,
        terrain: 'plains',
        danger_level: 10,
        prosperity: 50,
        population: 'moderate',
        notable_locations: [],
        controlling_organization_id: null,
        resources: [],
        connections: [],
      }))
    } else {
      w.regions = [{
        id: 'region-1',
        name: '大陆中心',
        description: '世界的中心地带，各方势力交汇之处。',
        terrain: 'plains',
        danger_level: 10,
        prosperity: 50,
        population: 'moderate',
        notable_locations: [],
        controlling_organization_id: null,
        resources: [],
        connections: [],
      }]
    }
  } else {
    for (const region of w.regions) {
      if (!region.description) region.description = ''
      if (region.prosperity == null) region.prosperity = 50
      if (region.population == null) region.population = 'moderate'
      if (!region.terrain) region.terrain = 'plains'
      if (!Array.isArray(region.resources)) region.resources = []
      if (!Array.isArray(region.connections)) region.connections = []
      if (!Array.isArray(region.notable_locations)) region.notable_locations = []
    }
  }

  // Ensure factions exist (copy from organizations if needed)
  if (!Array.isArray(w.factions) || w.factions.length === 0) {
    const orgs = w.organizations ?? []
    w.factions = orgs.map((o: any) => ({
      id: o.id,
      name: o.name,
      history: o.description || '',
      category: o.type || 'other',
      alignment: 'neutral',
      influence: 'local',
      influence_score: o.influence_score ?? 50,
      resources: o.resources ?? 20,
      ideology: o.ideology || '',
      traits: [],
      cohesion: o.cohesion ?? 70,
      relations: o.relations || [],
      leader_ids: [],
      member_ids: o.member_ids || [],
      tags: [],
      user_defined: false,
      public_perception: o.public_reputation ?? 50,
      military_strength: o.military_strength,
      economic_power: o.economic_power,
      status: o.status,
    }))
  }

  // Backfill organization new fields (Phase 1-5)
  if (Array.isArray(w.organizations)) {
    for (const org of w.organizations) {
      if (!org.personality) org.personality = undefined // Will be initialized by math engine
      if (!org.reputation) org.reputation = undefined
      if (!org.resource_pool) org.resource_pool = undefined
      if (!org.memory) org.memory = undefined
      if (!Array.isArray(org.treaties)) org.treaties = []
      if (org.attention_fatigue == null) org.attention_fatigue = 0
    }
  }

  // Backfill global systems (Phase 1-5)
  if (!Array.isArray(w._tensions)) w._tensions = []
  if (!Array.isArray(w._coalitions)) w._coalitions = []
  if (!Array.isArray(w._ideologies)) w._ideologies = []

  // Backfill missing character attributes (20 属性系统) — 带随机偏移避免克隆
  const noisy = (base: number) => base * (0.8 + Math.random() * 0.4)
  const needsValue = (v: any) => v == null || v === 0
  if (Array.isArray(w.characters)) {
    for (const char of w.characters) {
      // 身体（0 值视为缺失，需要随机化）
      if (needsValue(char.health)) char.health = noisy(80)
      if (needsValue(char.energy)) char.energy = noisy(70)
      if (needsValue(char.stress)) char.stress = noisy(20)
      if (needsValue(char.aging)) char.aging = noisy(20)
      if (needsValue(char.vitality)) char.vitality = noisy(80)
      // 精神
      if (needsValue(char.morale)) char.morale = noisy(55)
      if (needsValue(char.focus)) char.focus = noisy(60)
      if (needsValue(char.sanity)) char.sanity = noisy(80)
      // 社会
      if (needsValue(char.influence)) char.influence = noisy(1)
      if (needsValue(char.reputation)) char.reputation = noisy(1)
      if (needsValue(char.standing)) char.standing = noisy(1)
      if (needsValue(char.loyalty)) char.loyalty = noisy(50)
      // 资源（0 是合法值，保持 0）
      if (char.wealth == null) char.wealth = noisy(1)
      if (char.army == null) char.army = 0
      if (char.retainers == null) char.retainers = 0
      if (char.secrets == null) char.secrets = 0
      // 能力（0 值视为缺失）
      if (needsValue(char.martial)) char.martial = noisy(1)
      if (needsValue(char.cunning)) char.cunning = noisy(1)
      if (needsValue(char.charisma)) char.charisma = noisy(1)
      if (needsValue(char.lore)) char.lore = noisy(1)
      // 性格参数（带随机偏移）
      if (!char.personality_params) {
        char.personality_params = {
          stability: noisy(50), agency: noisy(50),
          empathy: noisy(50), attachment: noisy(50), openness: noisy(50),
        }
      }
      // 状态
      if (!char.condition) char.condition = 'content'
      // 关系和欲望
      if (!Array.isArray(char.relations)) char.relations = []
      if (!Array.isArray(char.desires)) char.desires = []
      // custom_formulas
      if (!char.custom_formulas) char.custom_formulas = {}
    }
  }

  // Backfill organization cohesion (防止凝聚力归零)
  if (Array.isArray(w.organizations ?? w.factions)) {
    const orgs = w.organizations ?? w.factions
    for (const org of orgs) {
      if (org.cohesion == null || org.cohesion < 5) {
        org.cohesion = 40 + Math.random() * 20 // 40-60
      }
    }
  }
}

/**
 * 从 world 上读取或初始化 modifiers/facts/memories
 */
function getWorldExtensions(world: WorldSnapshot): {
  modifiers: ActiveModifier[]
  facts: WorldFact[]
  memories: Map<string, EntityMemory>
} {
  const w = world as any
  // Read existing data — only initialize if truly missing
  const modifiers: ActiveModifier[] = Array.isArray(w._modifiers) ? w._modifiers : []
  const facts: WorldFact[] = Array.isArray(w._facts) ? w._facts : []
  const memories: Map<string, EntityMemory> = w._memories instanceof Map ? w._memories : new Map()
  // Write back if we had to initialize (so callers mutate the world object)
  if (!Array.isArray(w._modifiers)) w._modifiers = modifiers
  if (!Array.isArray(w._facts)) w._facts = facts
  if (!(w._memories instanceof Map)) w._memories = memories
  return { modifiers, facts, memories }
}

/**
 * 处理新命令：解析目标、生成 modifiers 和 facts
 */
function processNewCommands(
  commands: GodCommand[],
  world: WorldSnapshot,
  tick: number,
  context: ReturnType<typeof buildTickContext>,
): { modifiers: ActiveModifier[]; facts: WorldFact[]; events: SimEvent[] } {
  const allModifiers: ActiveModifier[] = []
  const allFacts: WorldFact[] = []
  const events: SimEvent[] = []

  const orgs = context.organizations.map(o => ({ id: o.id, name: o.name }))
  const chars = context.characters.map(c => ({ id: c.id, name: c.name }))
  const regions = context.regions.map(r => ({ id: r.id, name: r.name }))

  for (const command of commands) {
    if (command.status !== 'pending' && command.status !== 'parsed') continue

    // 解析目标
    if (command.target_type === 'world' && !command.target_id) {
      resolveCommandTarget(command, context)
    }

    // 标记为执行中
    command.status = 'executing'
    command.total_ticks_worked = 0

    // 根据叙事计划设置预计 tick 数
    const planLength = command.narrative_plan?.length ?? 0
    if (planLength > 0) {
      command.estimated_ticks = planLength * 4 // 每阶段约 4 tick
    }

    // 生成 modifiers（基于叙事计划长度决定持续时间）
    const mods = inferModifiersFromCommand(command, tick)
    allModifiers.push(...mods)

    // 生成 facts
    const facts = inferFactsFromCommand(command, tick, orgs, chars, regions)
    allFacts.push(...facts)

    // 生成命令下达事件
    const targetName = command.target_name || '世界'
    const firstStage = command.narrative_plan?.[0] ?? command.raw_input.slice(0, 30)
    const event = createSimEvent(
      `evt_cmd_${command.id}`,
      'god_command',
      `神令降临：${targetName}`,
      tick,
    )
    event.summary = `神令「${command.raw_input.slice(0, 30)}」已下达`
    event.detail = planLength > 0
      ? `神的意志降临。${firstStage}。预计经历 ${planLength} 个阶段，持续约 ${command.estimated_ticks} tick。`
      : `神的意志将通过持续效果改变世界。影响字段：${mods.map(m => m.field).join('、')}`
    event.actor_ids = ['god']
    event.target_ids = command.target_id ? [command.target_id] : []
    event.importance = command.strength === 'divine_decree' ? 0.95 : command.strength === 'order' ? 0.8 : 0.65
    event.effects = [] // 效果通过 modifiers 持续生效，不一次性应用
    event.tags = ['command', command.target_type]
    event.source = 'god_command'
    events.push(event)
    command.generated_event_ids.push(event.id)

    // 设置反馈
    command.feedback = planLength > 0
      ? `神令「${command.raw_input.slice(0, 20)}」已下达，将经历 ${planLength} 个阶段，预计持续 ${command.estimated_ticks} tick。`
      : `神令「${command.raw_input.slice(0, 20)}」已下达，将通过 ${mods.length} 个持续效果影响世界，预计持续 ${mods[0]?.remaining_ticks ?? 0} tick。`
  }

  return { modifiers: allModifiers, facts: allFacts, events }
}

function resolveCommandTarget(command: GodCommand, context: ReturnType<typeof buildTickContext>): void {
  const text = command.raw_input.toLowerCase()

  for (const org of context.organizations) {
    if (text.includes(org.name.toLowerCase())) {
      command.target_type = 'organization'
      command.target_id = org.id
      command.target_name = org.name
      return
    }
  }

  for (const char of context.characters) {
    if (text.includes(char.name.toLowerCase())) {
      command.target_type = 'character'
      command.target_id = char.id
      command.target_name = char.name
      return
    }
  }

  for (const region of context.regions) {
    if (text.includes(region.name.toLowerCase())) {
      command.target_type = 'region'
      command.target_id = region.id
      command.target_name = region.name
      return
    }
  }
}

/**
 * 检查并完成已到期的命令
 */
function checkCommandCompletion(
  commands: GodCommand[],
  modifiers: ActiveModifier[],
  tick: number,
): void {
  for (const command of commands) {
    if (command.status !== 'executing') continue

    // 检查该命令的 modifiers 是否全部过期
    const commandMods = modifiers.filter(m => m.source_command_id === command.id)
    const activeMods = commandMods.filter(m => m.remaining_ticks > 0)

    if (activeMods.length === 0 && commandMods.length > 0) {
      // 所有 modifiers 已过期，命令完成
      command.status = 'completed'
      command.resolved_at_tick = tick
      command.progress = 1
      command.total_ticks_worked = tick - command.issued_at_tick
      const stages = command.narrative_plan?.length ?? 0
      command.feedback = stages > 0
        ? `神令「${command.raw_input.slice(0, 20)}」已完成，经历了 ${stages} 个阶段，持续了 ${command.total_ticks_worked} tick。`
        : `神令「${command.raw_input.slice(0, 20)}」已完成，持续了 ${command.total_ticks_worked} tick。`
    } else if (commandMods.length > 0) {
      // 更新进度
      const totalTicks = commandMods[0]?.remaining_ticks ?? 0
      const workedTicks = tick - command.issued_at_tick
      command.progress = Math.min(1, workedTicks / (workedTicks + totalTicks))
      command.total_ticks_worked = workedTicks
    }
  }
}

/**
 * 记录本 tick 与神命令相关的事件到 intermediate_results
 */
function recordCommandIntermediates(
  commands: GodCommand[],
  events: SimEvent[],
): void {
  const executingCommands = commands.filter(c => c.status === 'executing')
  if (executingCommands.length === 0) return

  for (const cmd of executingCommands) {
    // 找到本 tick 与该命令相关的事件
    const relatedEvents = events.filter(e => {
      // god_command source 事件
      if (e.source === 'god_command') return true
      // 提到命令目标的事件
      if (cmd.target_name && e.title.includes(cmd.target_name)) return true
      if (cmd.target_name && e.summary.includes(cmd.target_name)) return true
      // 有相关 tag 的事件
      if (e.tags.includes('command') || e.tags.includes(cmd.target_type)) return true
      return false
    })

    for (const evt of relatedEvents) {
      const summary = `${evt.title}：${evt.summary}`.slice(0, 100)
      if (!cmd.intermediate_results.includes(summary)) {
        cmd.intermediate_results.push(summary)
      }
    }
  }
}

export async function runSimulationTick(input: WorldTickInput): Promise<WorldTickOutput> {
  const { world } = input

  // Backfill missing data for old worlds
  if (!isWorldState(world)) {
    backfillWorldData(world)
  }

  const state = toWorldState(world)
  const nextTick = state.time.tick + 1
  const worldCommands = isWorldState(world)
    ? []
    : ((world as WorldSnapshot & { god_commands?: GodCommand[] }).god_commands ?? [])
  const activeWorldCommands = worldCommands.filter(command => command.status !== 'completed' && command.status !== 'refused' && command.status !== 'failed')

  // Merge: new pending commands + previously executing commands from world
  // This ensures the LLM sees ALL active commands, not just the newest one
  const newCommands = input.pendingCommands ?? []
  const allActiveCommands = newCommands.length > 0
    ? [
        ...newCommands,
        ...activeWorldCommands.filter(wc => !newCommands.some(nc => nc.id === wc.id)),
      ]
    : activeWorldCommands
  const context = buildTickContext(world, allActiveCommands, nextTick)

  // 获取世界扩展数据
  const worldSlice = isWorldState(world) ? worldStateToSnapshot(state) : world
  const { modifiers, facts, memories } = getWorldExtensions(worldSlice)

  // ─── Phase 1: 处理新命令 ───
  const pendingCommands = allActiveCommands.filter(c => c.status === 'pending' || c.status === 'parsed')
  const commandResult = processNewCommands(pendingCommands, worldSlice, nextTick, context)
  modifiers.push(...commandResult.modifiers)
  facts.push(...commandResult.facts)

  // ─── Phase 2: 应用 active modifiers + 数学引擎 ───
  const mathResult = runMathEngine(worldSlice, nextTick, modifiers, facts)

  // 清理过期 modifiers
  const cleanedModifiers = cleanupModifiers(modifiers)
  // 更新 world 上的 modifiers
  ;(worldSlice as any)._modifiers = cleanedModifiers

  // ─── Phase 3: 构建实体记忆上下文 ───
  const recentEvents = ((worldSlice as any).events ?? []).slice(-20)
  const orgs = (worldSlice as any).organizations ?? (worldSlice as any).factions ?? []
  const chars = (worldSlice as any).characters ?? []

  let memoryContext = ''
  for (const org of orgs) {
    const memory = getOrCreateMemory(memories, org.id, 'organization')
    if (memory.entries.length > 0) {
      memoryContext += '\n' + formatMemoryForLLM(org.name, memory, 6)
    }
  }
  for (const char of chars) {
    const memory = getOrCreateMemory(memories, char.id, 'character')
    if (memory.entries.length > 0) {
      memoryContext += '\n' + formatMemoryForLLM(char.name, memory, 6)
    }
  }

  // ─── Phase 4: 三 Agent 流水线（Story → Data → Formula） ───
  let llmEvents: SimEvent[] = []
  let llmNarrative = ''
  let llmMood = (worldSlice as any).world_mood ?? 'calm'

  // 格式化数学引擎的变化
  const mathChangesLines = mathResult.events.map(e => `- ${e.title}: ${e.summary}`)
  const mathChangesSummary = mathChangesLines.length > 0
    ? mathChangesLines.join('\n')
    : '（本 tick 无显著数值变化）'

  // ─── 叙事线维护 ───
  const previousNarrativeThread: string = (worldSlice as any)._narrative_thread ?? ''

  // ─── 组织状态翻译（数值变化 → 自然语言故事素材）───
  const stateNarrative = translateStateToNarrative(orgs, chars)

  // 构建实体上下文（含自定义指标）
  const orgContexts = orgs.map((o: any) => ({
    id: o.id ?? '',
    name: o.name ?? '',
    type: o.type ?? 'other',
    status: o.status ?? 'stable',
    description: o.description ?? '',
    custom_metrics: o.custom_metrics ?? {},
    custom_metric_defs: o.custom_metric_defs ?? [],
    custom_formulas: o.custom_formulas ?? {},
    influence_score: o.influence_score ?? 0,
    military_strength: o.military_strength ?? 0,
    economic_power: o.economic_power ?? 0,
    cohesion: o.cohesion ?? 0,
    public_reputation: o.public_reputation ?? 0,
    resources: o.resources ?? 0,
    population: o.population ?? 0,
  }))

  const regionContexts = (worldSlice as any).regions?.map((r: any) => ({
    id: r.id ?? '',
    name: r.name ?? '',
    terrain: r.terrain ?? 'plains',
    description: r.description ?? '',
    custom_metrics: r.custom_metrics ?? {},
    custom_metric_defs: r.custom_metric_defs ?? [],
    custom_formulas: r.custom_formulas ?? {},
    danger_level: r.danger_level ?? 0,
    prosperity: r.prosperity ?? 0,
    population: r.population ?? 0,
  })) ?? []

  const charContexts = chars.map((c: any) => ({
    id: c.id ?? '',
    name: c.name ?? '',
    status: c.status ?? 'alive',
    organization_id: c.organization_id ?? c.faction_id ?? null,
    custom_metrics: c.custom_metrics ?? {},
    custom_metric_defs: c.custom_metric_defs ?? [],
    // 身体
    vitality: c.vitality ?? 80,
    health: c.health ?? 80,
    energy: c.energy ?? 70,
    stress: c.stress ?? 20,
    aging: c.aging ?? 20,
    // 精神
    morale: c.morale ?? 55,
    focus: c.focus ?? 60,
    sanity: c.sanity ?? 80,
    // 社会
    influence: c.influence ?? 1,
    reputation: c.reputation ?? 1,
    standing: c.standing ?? 1,
    loyalty: c.loyalty ?? 50,
    // 资源
    wealth: c.wealth ?? 1,
    army: c.army ?? 0,
    retainers: c.retainers ?? 0,
    secrets: c.secrets ?? 0,
    // 能力
    martial: c.martial ?? 1,
    cunning: c.cunning ?? 1,
    charisma: c.charisma ?? 1,
    lore: c.lore ?? 1,
    // 状态
    condition: c.condition,
    personality_params: c.personality_params,
  }))

  const recentEventSummaries = recentEvents.map((e: any) => ({
    title: e.title ?? '',
    summary: e.summary ?? '',
    tick: e.tick ?? nextTick,
  }))

  // ─── Phase 4: LLM Pipeline (Combined Agent + Formula Agent in parallel) ───
  const formulaTrigger = shouldTriggerFormulaAgent(
    nextTick,
    ((worldSlice as any)._formula_history ?? []).slice(-20),
    orgContexts,
  )

  // Fire both LLM calls in parallel — Formula Agent is independent of Combined Agent
  const combinedPromise = generateCombinedEvents({
    worldPremise: context.premise,
    language: context.language,
    tick: context.tick,
    world_mood: context.worldMood,
    organizations: orgContexts,
    regions: regionContexts,
    characters: charContexts,
    recent_events: recentEventSummaries,
    pending_commands: allActiveCommands,
    entity_memory: memoryContext || undefined,
    math_changes: mathChangesSummary,
    narrative_thread: previousNarrativeThread || undefined,
    state_narrative: stateNarrative || undefined,
  }).catch(err => {
    console.error('[world-tick] Combined Agent failed:', err)
    return null
  })

  const formulaPromise = formulaTrigger.trigger
    ? generateFormulaAdjustments({
        tick: nextTick,
        language: context.language,
        organizations: orgContexts,
        regions: regionContexts,
        recent_history: ((worldSlice as any)._formula_history ?? []).slice(-20),
        recent_events: recentEventSummaries,
        trigger: 'periodic',
        trigger_details: formulaTrigger.reason,
      }).catch(err => {
        console.error('[world-tick] Formula Agent failed:', err)
        return null
      })
    : Promise.resolve(null)

  // Wait for both LLM calls to complete (parallel, not sequential)
  const [combinedOutput, formulaOutput] = await Promise.all([combinedPromise, formulaPromise])

  // ─── Process Combined Agent output ───
  if (combinedOutput && combinedOutput.events.length > 0) {
    // Convert combined events to SimEvents
    llmEvents = combinedOutput.events.map(raw => {
      const event = createSimEvent(
        `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        (raw.type || 'other') as SimEvent['type'],
        raw.title,
        nextTick,
      )
      event.summary = raw.summary
      event.detail = raw.caused_by
        ? `[起因：${raw.caused_by}] ${raw.detail ?? ''}`
        : (raw.detail ?? '')
      event.actor_ids = raw.actor_ids ?? []
      event.target_ids = raw.target_ids ?? []
      event.location_region_id = raw.location_region_id ?? null
      event.importance = Math.max(0, Math.min(1, raw.importance ?? 0.5))
      event.tags = raw.tags ?? []
      event.source = 'world_director'

      // Use effects from combined output (already includes numerical deltas)
      // 标准字段名保留原样，非标准字段才加 custom_metrics. 前缀
      const STANDARD_FIELDS = new Set([
        // 组织
        'influence_score', 'military_strength', 'economic_power', 'cohesion', 'public_reputation', 'resources', 'population',
        // 角色
        'vitality', 'health', 'energy', 'stress', 'morale', 'focus', 'sanity',
        'influence', 'reputation', 'standing', 'loyalty',
        'wealth', 'army', 'retainers', 'secrets',
        'martial', 'cunning', 'charisma', 'lore',
        // 地区
        'danger_level', 'prosperity',
      ])
      if (raw.effects && raw.effects.length > 0) {
        event.effects = raw.effects.map(ef => ({
          target_type: (ef.target_type === 'character' ? 'character' :
                        ef.target_type === 'region' ? 'region' : 'organization') as SimEventEffect['target_type'],
          target_id: ef.target_id,
          field: STANDARD_FIELDS.has(ef.field) ? ef.field : (ef.field.startsWith('custom_metrics.') ? ef.field : `custom_metrics.${ef.field}`),
          delta: ef.delta,
          description: ef.description,
        }))
      } else {
        // Fallback: use affects-based direction mapping
        const relatedChanges = combinedOutput.data_changes.filter(c =>
          raw.affects?.some(a => a.entity_id === c.entity_id),
        )
        event.effects = relatedChanges.map(c => ({
          target_type: (c.entity_type === 'character' ? 'character' :
                        c.entity_type === 'region' ? 'region' : 'organization') as SimEventEffect['target_type'],
          target_id: c.entity_id,
          field: `custom_metrics.${c.metric_key}`,
          delta: c.delta,
          description: c.reason,
        }))
      }

      return event
    })

    llmNarrative = combinedOutput.tick_narrative
    llmMood = combinedOutput.world_mood
  } else {
    // Fallback: use single-agent approach
    try {
      const llmOutput = await generateTickEvents({
        worldId: context.worldId,
        premise: context.premise,
        language: context.language,
        tick: context.tick,
        era_label: context.eraLabel,
        world_mood: context.worldMood,
        regions: context.regions,
        organizations: context.organizations,
        characters: context.characters,
        recent_events: recentEventSummaries,
        pending_commands: allActiveCommands,
        active_modifiers: cleanedModifiers,
        math_changes: mathChangesSummary,
        entity_memory: memoryContext || undefined,
      })

      llmEvents = llmOutput.events
        .filter(raw => raw && raw.title && raw.title !== '世界静默' && raw.title !== 'World silent')
        .map(raw => {
          const event = createSimEvent(
            `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            raw.type as SimEvent['type'],
            raw.title,
            nextTick,
          )
          event.summary = raw.summary
          event.detail = raw.detail
          event.actor_ids = raw.actor_ids ?? []
          event.target_ids = raw.target_ids ?? []
          event.location_region_id = raw.location_region_id ?? null
          event.importance = Math.max(0, Math.min(1, raw.importance ?? 0.5))
          event.effects = (raw.effects ?? []).map((e: any) => ({
            ...e,
            target_type: e.target_type as SimEventEffect['target_type'],
          }))
          event.tags = raw.tags ?? []
          event.source = 'world_director'
          return event
        })

      llmNarrative = llmOutput.tick_narrative
      llmMood = llmOutput.world_mood
    } catch (err) {
      console.error('[world-tick] Single-agent LLM tick generation also failed:', err)
    }
  }

  // ─── Process Formula Agent output ───
  if (formulaOutput) {
    // Apply formula changes
    for (const change of formulaOutput.formula_changes) {
      const org = orgs.find((o: any) => o.id === change.entity_id)
      if (org && org.custom_formulas) {
        org.custom_formulas[change.metric_key] = change.new_formula
      }
      const region = (worldSlice as any).regions?.find((r: any) => r.id === change.entity_id)
      if (region && region.custom_formulas) {
        region.custom_formulas[change.metric_key] = change.new_formula
      }
    }

    // Apply scale adjustments
    for (const adj of formulaOutput.scale_adjustments) {
      const org = orgs.find((o: any) => o.id === adj.entity_id)
      if (org?.custom_metric_defs) {
        const def = org.custom_metric_defs.find((d: any) => d.key === adj.metric_key)
        if (def) def.max = adj.new_max
      }
    }
  }

  // Record formula history (always, whether formula agent ran or not)
  if (!(worldSlice as any)._formula_history) {
    (worldSlice as any)._formula_history = []
  }
  ;(worldSlice as any)._formula_history.push({
    tick: nextTick,
    organizations: orgs.map((o: any) => ({ id: o.id, custom_metrics: { ...o.custom_metrics } })),
    regions: ((worldSlice as any).regions ?? []).map((r: any) => ({ id: r.id, custom_metrics: { ...r.custom_metrics } })),
  })
  if ((worldSlice as any)._formula_history.length > 20) {
    (worldSlice as any)._formula_history = (worldSlice as any)._formula_history.slice(-20)
  }

  // ─── 叙事线更新 ───
  if (llmNarrative) {
    const newEntry = `[tick ${nextTick}] ${llmNarrative.slice(0, 150)}`
    const threadLines = previousNarrativeThread.split('\n').filter(Boolean)
    threadLines.push(newEntry)
    const updatedThread = threadLines.slice(-5).join('\n')
    ;(worldSlice as any)._narrative_thread = updatedThread
  }

  // ─── Phase 5: 合并所有事件 ───
  const allEvents = [
    ...commandResult.events,
    ...mathResult.events,
    ...llmEvents,
  ]

  // ─── Phase 5.5: 性格漂移 ───
  applyPersonalityDrift(worldSlice, allEvents)

  // ─── Phase 6: 应用后果 ───
  const consequenceResult = applyConsequences(worldSlice, allEvents, llmMood)

  // ─── Phase 6.5: 新系统集成 ───
  // 6.5a 组织记忆记录（将本 tick 事件写入组织记忆）
  for (const org of orgs) {
    if (org.memory) {
      const orgEvents = allEvents.filter(e =>
        e.actor_ids?.includes(org.id) || e.target_ids?.includes(org.id)
      )
      for (const evt of orgEvents) {
        recordOrgMemory(org.memory, {
          id: `mem_${evt.id}`,
          content: `${evt.title}：${evt.summary}`,
          importance: evt.importance,
          emotional_weight: evt.type === 'battle' || evt.type === 'betrayal' || evt.type === 'rebellion' ? -0.5
            : evt.type === 'alliance' || evt.type === 'trade' ? 0.5
            : 0,
          source: evt.type === 'god_command' ? 'command' : evt.type === 'battle' || evt.type === 'rebellion' ? 'conflict' : 'world',
          event_type: evt.type,
          related_entity_ids: [...(evt.actor_ids ?? []), ...(evt.target_ids ?? [])],
          tick: nextTick,
        }, nextTick)
      }
    }

    // 6.5b 声誉更新（基于事件）
    if (org.reputation) {
      const orgEvents = allEvents.filter(e =>
        e.actor_ids?.includes(org.id) || e.target_ids?.includes(org.id)
      )
      for (const evt of orgEvents) {
        org.reputation = applyReputationEvent(org.reputation, evt.type, evt.importance)
      }
    }
  }

  // 6.5c 联盟系统演算
  const wCoalitions = (worldSlice as any)._coalitions ?? []
  const orgPersonalities = orgs.map((o: any) => ({
    id: o.id ?? '',
    name: o.name ?? '',
    personality: o.personality,
    relations: o.relations ?? [],
  }))
  const newCoalitions = checkCoalitionFormation(orgPersonalities, {}, wCoalitions, nextTick)
  wCoalitions.push(...newCoalitions)
  evolveCoalitions(wCoalitions, orgPersonalities, {}, nextTick)
  ;(worldSlice as any)._coalitions = wCoalitions

  // 6.5d 紧张度触发检查
  const wTensions = (worldSlice as any)._tensions ?? []
  const newTensions = checkTensionTriggers(orgs, wTensions, nextTick)
  wTensions.push(...newTensions)
  ;(worldSlice as any)._tensions = wTensions

  // 6.5e 意识形态传播
  const wIdeologies = (worldSlice as any)._ideologies ?? []
  if (wIdeologies.length > 0) {
    const orgStates = new Map<string, import('./ideology-propagation').OrgIdeologyState>(orgs.map((o: any) => [o.id, {
      org_id: o.id,
      ideology_id: null,
      infection_state: 'susceptible' as const,
      resistance: o.personality ? (o.personality.tradition / 100) : 0.5,
      exposure_count: 0,
      infection_tick: null,
    }]))
    propagateIdeology(wIdeologies, orgStates, orgPersonalities, nextTick)
    decayIdeologyImmunity(orgStates, nextTick)
  }

  // 6.5f 知识图谱同步
  const wKG = (worldSlice as any)._knowledge_graph
  if (wKG) {
    syncKnowledgeGraph(wKG, orgs, (worldSlice as any).regions ?? [], chars, nextTick)
  }

  // ─── Phase 7: 更新实体记忆 ───
  updateMemoriesFromEvents(memories, allEvents)

  // ─── Phase 7.5: 记录命令中间结果 ───
  recordCommandIntermediates(allActiveCommands, allEvents)

  // ─── Phase 8: 检查命令完成 ───
  checkCommandCompletion(allActiveCommands, cleanedModifiers, nextTick)

  // ─── Phase 9: 记录历史快照 ───
  recordSnapshot(worldSlice, allEvents.length)

  // ─── Phase 10: 合并回世界状态 ───
  const updatedWorld = isWorldState(world)
    ? (() => {
        const ws = snapshotToWorldState(consequenceResult.world)
        ws.time = createWorldTime(nextTick)
        ws.world_mood = llmMood
        // 保留 god_commands 作为完整对象（WorldState 类型声明为 string[]，但运行时存储完整对象）
        ;(ws as any).god_commands = allActiveCommands
        return ws
      })()
    : mergeWorldSnapshot(world, nextTick, allEvents, llmMood, allActiveCommands, consequenceResult.world)

  // 构建叙述
  const narrative = llmNarrative || mathResult.summary

  return {
    world: updatedWorld,
    new_events: allEvents,
    resolved_commands: allActiveCommands,
    tick_narrative: narrative,
    new_world_mood: llmMood,
  }
}

// ─── 状态翻译：数值变化 → 自然语言故事素材 ───

function translateStateToNarrative(orgs: any[], chars: any[]): string {
  const lines: string[] = []

  for (const org of orgs) {
    const changes: string[] = []

    // 性格驱动的状态描述
    const p = org.personality
    if (p) {
      if (p.aggression > 70) changes.push('好战倾向加剧')
      else if (p.aggression < 30) changes.push('趋向和平')
      if (p.openness < 30) changes.push('趋于封闭排外')
      if (p.centralization > 70) changes.push('权力高度集中')
      if (p.tradition > 70) changes.push('保守势力抬头')
    }

    // 关键指标危机
    if (org.cohesion < 25) changes.push('凝聚力崩溃，面临分裂')
    else if (org.cohesion < 40) changes.push('内部矛盾加剧')
    if (org.military_strength > 70) changes.push('军力膨胀')
    if (org.influence_score < 20) changes.push('影响力衰微')

    // 资源危机
    const rp = org.resource_pool
    if (rp) {
      if (rp.food < 20) changes.push('粮食告急')
      if (rp.treasury < 15) changes.push('金库枯竭')
      if (rp.manpower < 10) changes.push('人口凋零')
    }

    // 声誉变化
    const rep = org.reputation
    if (rep) {
      if (rep.diplomatic_trust < 25) changes.push('外交信誉崩塌')
      if (rep.military_prowess > 70) changes.push('军事威望高涨')
    }

    // 状态
    if (org.status === 'declining') changes.push('处于衰退期')
    if (org.status === 'collapsed') changes.push('已崩溃')

    if (changes.length > 0) {
      lines.push(`${org.name}：${changes.join('，')}`)
    }
  }

  // 角色关键状态
  for (const char of chars) {
    if (char.status !== 'alive') continue
    const charChanges: string[] = []
    if (char.condition === 'scheming') charChanges.push('密谋中')
    if (char.condition === 'unhinged') charChanges.push('失控')
    if (char.condition === 'desperate') charChanges.push('陷入绝望')
    if (char.condition === 'critical') charChanges.push('生命垂危')
    if (char.loyalty < 20 && char.organization_id) charChanges.push('忠诚动摇')
    if (char.stress > 80) charChanges.push('压力爆表')
    if (charChanges.length > 0) {
      lines.push(`${char.name}：${charChanges.join('，')}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : ''
}
