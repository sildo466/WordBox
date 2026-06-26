import { createLLMClient, getModel, callLLM } from '@/services/llm/client'
import type { SimEvent } from '@/core/sim/event'
import type { GodCommand } from '@/core/sim/command'
import type { ActiveModifier } from '@/core/sim/modifier'

export type TickGeneratorInput = {
  worldId: string
  premise: string
  language: string
  tick: number
  era_label: string
  world_mood: string
  regions: Array<{
    id: string; name: string; terrain: string; danger_level: number; controlling_organization_id: string | null
    description?: string; population?: number | string; prosperity?: number; resources?: string[]; notable_locations?: string[]
  }>
  organizations: Array<{
    id: string; name: string; type: string; status: string; influence_score: number
    description?: string; military_strength?: number; economic_power?: number; cohesion?: number; public_reputation?: number; resources?: number; ideology?: string
  }>
  characters: Array<{
    id: string; name: string; status: string; organization_id: string | null; current_task: string | null
    // 身体
    vitality?: number; health?: number; energy?: number; stress?: number; aging?: number
    // 精神
    morale?: number; focus?: number; sanity?: number
    // 社会
    influence?: number; reputation?: number; standing?: number; loyalty?: number
    // 资源
    wealth?: number; army?: number; retainers?: number; secrets?: number
    // 能力
    martial?: number; cunning?: number; charisma?: number; lore?: number
    // 状态
    condition?: string
    personality_params?: { stability: number; agency: number; empathy: number; attachment: number; openness: number }
  }>
  recent_events: Array<{ title: string; summary: string; tick: number }>
  pending_commands: GodCommand[]
  /** 当前生效的 modifiers（神命令持续效果） */
  active_modifiers?: ActiveModifier[]
  /** 数学引擎本 tick 的变化摘要 */
  math_changes?: string
  /** 实体记忆上下文 */
  entity_memory?: string
}

type RawTickEvent = {
  type: string
  title: string
  summary: string
  detail: string
  actor_ids: string[]
  target_ids: string[]
  location_region_id: string | null
  importance: number
  effects: Array<{
    target_type: string
    target_id: string
    field: string
    delta: string | number
    description: string
  }>
  tags: string[]
}

type TickGeneratorOutput = {
  events: RawTickEvent[]
  world_mood: string
  tick_narrative: string
}

function toRawTickEvent(input: unknown): RawTickEvent | null {
  if (!input || typeof input !== 'object') return null
  const event = input as Record<string, unknown>

  const type = typeof event.type === 'string' ? event.type : 'other'
  const title = typeof event.title === 'string' ? event.title : ''
  const summary = typeof event.summary === 'string' ? event.summary : ''
  const detail = typeof event.detail === 'string' ? event.detail : summary

  const actor_ids = Array.isArray(event.actor_ids)
    ? event.actor_ids.filter((item): item is string => typeof item === 'string')
    : []
  const target_ids = Array.isArray(event.target_ids)
    ? event.target_ids.filter((item): item is string => typeof item === 'string')
    : []
  const location_region_id = typeof event.location_region_id === 'string' ? event.location_region_id : null
  const importance = typeof event.importance === 'number' ? event.importance : 0.5
  const tags = Array.isArray(event.tags)
    ? event.tags.filter((item): item is string => typeof item === 'string')
    : []

  const effects = Array.isArray(event.effects)
    ? event.effects.map((effect) => {
      if (!effect || typeof effect !== 'object') {
        return {
          target_type: 'world',
          target_id: '',
          field: '',
          delta: 0,
          description: '',
        }
      }

      const effectRecord = effect as Record<string, unknown>
      return {
        target_type: typeof effectRecord.target_type === 'string' ? effectRecord.target_type : 'world',
        target_id: typeof effectRecord.target_id === 'string' ? effectRecord.target_id : '',
        field: typeof effectRecord.field === 'string' ? effectRecord.field : '',
        delta: typeof effectRecord.delta === 'number' || typeof effectRecord.delta === 'string' ? effectRecord.delta : 0,
        description: typeof effectRecord.description === 'string' ? effectRecord.description : '',
      }
    })
    : []

  // 跳过空标题的事件
  if (!title) return null

  return {
    type,
    title,
    summary,
    detail,
    actor_ids,
    target_ids,
    location_region_id,
    importance,
    effects,
    tags,
  }
}

function normalizeTickGeneratorOutput(raw: unknown, input: TickGeneratorInput): TickGeneratorOutput {
  if (!raw || typeof raw !== 'object') {
    return {
      events: [],
      world_mood: input.world_mood,
      tick_narrative: '',
    }
  }

  const output = raw as Record<string, unknown>
  const events = Array.isArray(output.events)
    ? output.events
      .map(toRawTickEvent)
      .filter((event): event is RawTickEvent => event !== null)
    : []

  return {
    events,
    world_mood: typeof output.world_mood === 'string' ? output.world_mood : input.world_mood,
    tick_narrative: typeof output.tick_narrative === 'string' ? output.tick_narrative : '',
  }
}

function buildTickPrompt(input: TickGeneratorInput): string {
  const zh = input.language === 'zh'

  // Pending commands — 显示正在执行的命令及其叙事阶段
  const executingCommands = input.pending_commands.filter(c => c.status === 'executing')
  const pendingBlock = executingCommands.length > 0
    ? `\n## ⚡ 正在执行的神命令（最高优先级）\n${executingCommands.map(c => {
      const plan = c.narrative_plan ?? []
      const progress = c.progress ?? 0
      const currentStageIdx = Math.min(Math.floor(progress * plan.length), plan.length - 1)
      const parts = [`- 【${c.target_name || '世界'}】${c.raw_input}（进度：${Math.round(progress * 100)}%，强度：${c.strength}）`]
      if (plan.length > 0) {
        parts.push(`  叙事计划（共${plan.length}阶段）：`)
        for (let i = 0; i < plan.length; i++) {
          const marker = i < currentStageIdx ? '✅' : i === currentStageIdx ? '👉' : '⏳'
          parts.push(`  ${marker} 阶段${i + 1}：${plan[i]}`)
        }
        parts.push(`  ⬆ 当前应聚焦：阶段${currentStageIdx + 1}「${plan[currentStageIdx]}」`)
      }
      if (c.intermediate_results && c.intermediate_results.length > 0) {
        parts.push(`  已发生：${c.intermediate_results.slice(-3).join(' → ')}`)
      }
      return parts.join('\n')
    }).join('\n\n')}`
    : ''

  // Active modifiers — 显示正在生效的持续效果
  const activeMods = (input.active_modifiers ?? []).filter(m => m.remaining_ticks > 0)
  const modifierBlock = activeMods.length > 0
    ? `\n## 神令持续效果（正在改变世界）\n${activeMods.map(m => `- ${m.description}（${m.field} ${m.delta_per_tick > 0 ? '+' : ''}${m.delta_per_tick}/tick，剩余 ${m.remaining_ticks} tick）`).join('\n')}`
    : ''

  const recentBlock = input.recent_events.length > 0
    ? `\n## 最近事件（共${input.recent_events.length}条）\n${input.recent_events.slice(-15).map(e => `- Tick ${e.tick}: ${e.title} — ${e.summary}`).join('\n')}`
    : ''

  // 数学引擎变化
  const mathBlock = input.math_changes
    ? `\n## 本 tick 数学引擎已处理的变化\n${input.math_changes}\n\n以上是确定性规则计算出的数值变化（资源、军事、影响力等），你不需要重复生成这些。`
    : ''

  // 实体记忆
  const memoryBlock = input.entity_memory
    ? `\n## 实体历史记忆\n${input.entity_memory}`
    : ''

  const regionDetailLines = input.regions.map(r => {
    const parts = [`- ${r.name} [${r.terrain}`]
    parts.push(`危险${r.danger_level}`)
    if (r.population != null) parts.push(`人口${r.population}`)
    if (r.prosperity != null) parts.push(`繁荣${r.prosperity}`)
    if (r.controlling_organization_id) parts.push(`控制者:${r.controlling_organization_id}`)
    parts.push(']')
    if (r.description) parts.push(`  ${r.description}`)
    return parts.join(', ')
  }).join('\n')

  const orgDetailLines = input.organizations.map(o => {
    const parts = [`- ${o.name} [${o.type}, ${o.status}`]
    parts.push(`影响力${o.influence_score}`)
    if (o.military_strength != null) parts.push(`军事${o.military_strength}`)
    if (o.economic_power != null) parts.push(`经济${o.economic_power}`)
    if (o.cohesion != null) parts.push(`凝聚力${o.cohesion}`)
    if (o.public_reputation != null) parts.push(`声望${o.public_reputation}`)
    parts.push(']')
    if (o.description) parts.push(`  ${o.description}`)
    return parts.join(', ')
  }).join('\n')

  const hasExecutingCommands = executingCommands.length > 0

  // Build the command mandate block — appears at the VERY TOP if commands exist
  const commandMandate = hasExecutingCommands
    ? `═══════════════════════════════════════════════════════
⚡⚡⚡ 神令强制执行 — 本 tick 必须生成以下事件 ⚡⚡⚡
═══════════════════════════════════════════════════════

以下神令正在执行中，你**必须**为每个神令生成至少一个事件。这是最高优先级，不可跳过、不可忽略。
${executingCommands.map((c, i) => {
  const plan = c.narrative_plan ?? []
  const progress = c.progress ?? 0
  const currentStageIdx = plan.length > 0 ? Math.min(Math.floor(progress * plan.length), plan.length - 1) : -1
  const currentStage = currentStageIdx >= 0 ? plan[currentStageIdx] : null
  const lines = [`【神令${i + 1}】${c.raw_input}`]
  if (currentStage) {
    lines.push(`  ➤ 本 tick 必须描写：${currentStage}`)
  }
  if (c.intermediate_results && c.intermediate_results.length > 0) {
    lines.push(`  ➤ 上一 tick 发生了：${c.intermediate_results[c.intermediate_results.length - 1]}`)
    lines.push(`  ➤ 本事件必须承接上文，体现因果`)
  }
  return lines.join('\n')
}).join('\n\n')}

⚠️ 你的 events 数组中必须包含以上神令对应的事件。事件 title 必须包含具体关键词（如"生物武器"、"魔法阵"等），不要用笼统的"神令生效"。

═══════════════════════════════════════════════════════
`
    : ''

  return `${commandMandate}你是一个世界模拟引擎的叙事层。数学引擎已经处理了数值变化，你的职责是根据这些变化生成**有意义的剧情事件和叙事**。
${hasExecutingCommands ? '⚠️ 上方有神令正在执行，你必须优先处理。' : ''}
## 世界前提
${input.premise}
${modifierBlock}

## 当前状态
- 时间：${input.era_label}，Tick ${input.tick}
- 世界基调：${input.world_mood}
- 地区（${input.regions.length}个）：
${regionDetailLines || '- （无）'}
- 组织（${input.organizations.length}个）：
${orgDetailLines || '- （无）'}
- 角色（${input.characters.length}个）：
${input.characters.map(c => {
  const parts = [`- ${c.name} [${c.status}`]
  if (c.condition) parts.push(`状态:${c.condition}`)
  if (c.organization_id) parts.push(`组织:${c.organization_id}`)
  parts.push(']')
  const stats: string[] = []
  if (c.vitality != null) stats.push(`生命${c.vitality}`)
  if (c.health != null) stats.push(`健康${c.health}`)
  if (c.stress != null) stats.push(`压力${c.stress}`)
  if (c.morale != null) stats.push(`士气${c.morale}`)
  if (c.influence != null) stats.push(`影响${c.influence}`)
  if (c.wealth != null) stats.push(`财富${c.wealth}`)
  if (c.martial != null) stats.push(`武力${c.martial}`)
  if (c.cunning != null) stats.push(`谋略${c.cunning}`)
  if (c.loyalty != null) stats.push(`忠诚${c.loyalty}`)
  if (stats.length > 0) parts.push(`  ${stats.join(' ')}`)
  if (c.current_task) parts.push(`  当前:${c.current_task}`)
  return parts.join(', ')
}).join('\n')}
${mathBlock}
${recentBlock}
${memoryBlock}

## 任务
生成 1-5 个**剧情事件**。优先级排序：
${hasExecutingCommands ? `
1. **⚡ 神令事件（必须）**：按上方强制要求生成，事件 title 包含具体关键词
2. **解读数值变化**：数学引擎的变化 → 叙事事件
3. **戏剧冲突**：组织间摩擦、竞争
4. **故事延续**：基于近期事件的因果后续
5. **角色参与**：让角色做出决策、遭遇变故
` : `
1. **解读数值变化**：数学引擎的变化 → 叙事事件
2. **戏剧冲突**：组织间摩擦、竞争
3. **故事延续**：基于近期事件的因果后续
4. **角色参与**：让角色做出决策、遭遇变故
`}

### ⚠️ 规则
- **不要重复数学引擎的数值变化**，要生成叙事事件
- **不要生成"世界静默"类 fallback**
- effects 的 target_id 使用真实 ID，不要用名称
- effects 可选——叙事性事件可以没有 effects
- 所有文本使用${zh ? '中文（简体）' : input.language}

## effects 字段规范（可选）
effects 的 field 必须是以下之一：
- 组织：influence_score, military_strength, economic_power, cohesion, public_reputation, resources（无上限）
- 角色（有上限 0-100）：vitality, health, energy, stress, morale, focus, sanity, loyalty
- 角色（无上限）：influence, reputation, standing, wealth, army, retainers, secrets, martial, cunning, charisma, lore
- 地区：danger_level, prosperity, population（无上限）
delta 为数字（正数增加，负数减少）：
- 组织/地区字段：delta 通常 1-10，重大事件可 ±30
- 角色有上限字段：delta 通常 1-10
- 角色无上限字段：delta 通常 1-20，重大事件可 ±50
- population：delta 通常 1-10

## 输出格式（严格JSON）
{
  "events": [
    {
      "type": "battle|negotiation|assassination|disaster|discovery|trade|migration|rebellion|alliance|betrayal|romance|ritual|rumor|god_command|other",
      "title": "事件标题",
      "summary": "一句话摘要",
      "detail": "详细描述（2-3句）",
      "actor_ids": ["角色id列表"],
      "target_ids": ["目标id列表"],
      "location_region_id": "地区id或null",
      "importance": 0.1到1.0,
      "effects": [
        {
          "target_type": "character|organization|region|world",
          "target_id": "目标id",
          "field": "字段名",
          "delta": 数字,
          "description": "效果描述"
        }
      ],
      "tags": ["标签列表"]
    }
  ],
  "world_mood": "新的世界基调（calm/tense/chaotic/hopeful/grim）",
  "tick_narrative": "本次tick的整体叙述（2-3句，概括本tick发生的主要事件）"
}`
}

export async function generateTickEvents(input: TickGeneratorInput): Promise<TickGeneratorOutput> {
  const client = createLLMClient()
  const prompt = buildTickPrompt(input)

  const raw = await callLLM(client, {
    model: getModel(),
    max_tokens: 3072,
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    return normalizeTickGeneratorOutput(JSON.parse(jsonMatch[0]), input)
  } catch {
    // 不再生成 fallback 事件，返回空
    return {
      events: [],
      world_mood: input.world_mood,
      tick_narrative: '',
    }
  }
}
