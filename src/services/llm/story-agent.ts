/**
 * Story Agent — generates narrative events during each tick.
 * Responsible ONLY for storytelling, not numerical calculations.
 * Outputs affect directions (↑/↓) but no specific numbers.
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { GodCommand } from '@/core/sim/command'

// ─── Types ───

export type StoryAgentInput = {
  worldPremise: string
  language: string
  tick: number
  world_mood: string
  organizations: Array<{
    id: string
    name: string
    type: string
    status: string
    description: string
    custom_metrics?: Record<string, number>
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string }>
    custom_formulas?: Record<string, string>
  }>
  regions: Array<{
    id: string
    name: string
    terrain: string
    description?: string
    custom_metrics?: Record<string, number>
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string }>
    custom_formulas?: Record<string, string>
  }>
  characters: Array<{
    id: string
    name: string
    status: string
    organization_id: string | null
    custom_metrics?: Record<string, number>
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string }>
    // 20 属性
    vitality?: number; health?: number; energy?: number; stress?: number; aging?: number
    morale?: number; focus?: number; sanity?: number
    influence?: number; reputation?: number; standing?: number; loyalty?: number
    wealth?: number; army?: number; retainers?: number; secrets?: number
    martial?: number; cunning?: number; charisma?: number; lore?: number
    condition?: string
  }>
  recent_events: Array<{ title: string; summary: string; tick: number }>
  pending_commands: GodCommand[]
  entity_memory?: string
  math_changes?: string
  // 跨 tick 叙事线（滚动摘要，让故事有连续性）
  narrative_thread?: string
  // 组织状态变化的自然语言翻译（非数值，是故事素材）
  state_narrative?: string
}

export type StoryEventAffect = {
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  metrics: string[]  // 如 ["granary↓", "unrest↑"]
}

export type StoryEvent = {
  type: string
  title: string
  summary: string
  detail?: string
  actor_ids: string[]
  target_ids: string[]
  location_region_id?: string
  importance: number
  affects: StoryEventAffect[]
  tags: string[]
  caused_by?: string  // 引发此事件的前因（简短描述，用于因果链）
}

export type StoryAgentOutput = {
  events: StoryEvent[]
  world_mood: string
  tick_narrative: string
}

// ─── Prompt ───

function buildStoryPrompt(input: StoryAgentInput): string {
  const lang = input.language === 'zh' ? '中文' : 'English'

  // Build custom metrics context
  const orgContext = input.organizations.map(o => {
    let line = `- [${o.id}] ${o.name} (${o.type}, ${o.status}): ${o.description}`
    if (o.custom_metrics && o.custom_metric_defs && o.custom_metric_defs.length > 0) {
      const metrics = o.custom_metric_defs
        .map(d => {
          const val = o.custom_metrics![d.key] ?? '?'
          const formula = o.custom_formulas?.[d.key]
          return `${d.name}=${val}${d.unit ? d.unit : ''}${formula ? ` (${formula})` : ''}`
        })
        .join(', ')
      line += `\n  核心指标: ${metrics}`
    }
    return line
  }).join('\n')

  const regionContext = input.regions.map(r => {
    let line = `- [${r.id}] ${r.name} (${r.terrain}): ${r.description ?? ''}`
    if (r.custom_metrics && r.custom_metric_defs && r.custom_metric_defs.length > 0) {
      const metrics = r.custom_metric_defs
        .map(d => {
          const val = r.custom_metrics![d.key] ?? '?'
          const formula = r.custom_formulas?.[d.key]
          return `${d.name}=${val}${formula ? ` (${formula})` : ''}`
        })
        .join(', ')
      line += `\n  核心指标: ${metrics}`
    }
    return line
  }).join('\n')

  const charContext = input.characters.map(c => {
    let line = `- [${c.id}] ${c.name} (${c.status})${c.condition ? ` [${c.condition}]` : ''}${c.organization_id ? ` [${c.organization_id}]` : ''}`
    // 20 属性摘要
    const stats: string[] = []
    if (c.vitality != null) stats.push(`生命${c.vitality}`)
    if (c.health != null) stats.push(`健康${c.health}`)
    if (c.energy != null) stats.push(`体力${c.energy}`)
    if (c.stress != null) stats.push(`压力${c.stress}`)
    if (c.morale != null) stats.push(`士气${c.morale}`)
    if (c.sanity != null) stats.push(`理智${c.sanity}`)
    if (c.influence != null) stats.push(`影响${c.influence}`)
    if (c.reputation != null) stats.push(`声望${c.reputation}`)
    if (c.loyalty != null) stats.push(`忠诚${c.loyalty}`)
    if (c.wealth != null) stats.push(`财富${c.wealth}`)
    if (c.army != null && c.army > 0) stats.push(`兵力${c.army}`)
    if (c.martial != null) stats.push(`武力${c.martial}`)
    if (c.cunning != null) stats.push(`谋略${c.cunning}`)
    if (c.charisma != null) stats.push(`魅力${c.charisma}`)
    if (c.lore != null) stats.push(`学识${c.lore}`)
    if (stats.length > 0) line += `\n  属性: ${stats.join(', ')}`
    if (c.custom_metrics && c.custom_metric_defs && c.custom_metric_defs.length > 0) {
      const metrics = c.custom_metric_defs
        .map(d => `${d.name}=${c.custom_metrics![d.key] ?? '?'}`)
        .join(', ')
      line += `\n  自定义指标: ${metrics}`
    }
    return line
  }).join('\n')

  const recentContext = input.recent_events.slice(-10)
    .map(e => `- [Tick ${e.tick}] ${e.title}: ${e.summary}`)
    .join('\n')

  const commandContext = input.pending_commands
    .filter(c => c.status === 'executing' || c.status === 'parsed')
    .map(c => `- [${c.id}] ${c.raw_input} (状态: ${c.status})`)
    .join('\n')

  const entityMemoryBlock = input.entity_memory
    ? `\n## 实体记忆\n${input.entity_memory}`
    : ''

  const mathBlock = input.math_changes
    ? `\n## 数学引擎已处理的变化（不要重复这些数值变化）\n${input.math_changes}`
    : ''

  const commandBlock = commandContext
    ? `\n## 执行中的神谕命令（必须优先处理）\n${commandContext}`
    : ''

  const narrativeThreadBlock = input.narrative_thread
    ? `\n## 最近剧情线（新事件必须自然承接，不要重复，不要重置）\n${input.narrative_thread}`
    : ''

  const stateNarrativeBlock = input.state_narrative
    ? `\n## 组织状态变化（作为故事素材引用，不要直接复述）\n${input.state_narrative}`
    : ''

  return `你是一个世界模拟引擎的叙事层。你只负责生成故事情节，不负责数值计算。

## 你的职责
1. 为每个 tick 生成 1-5 个叙事事件
2. 每个事件标注它影响哪些实体的哪些**已有核心指标**的方向（↑ 或 ↓），但不写具体数值
3. Data Agent 会根据你的方向标注计算具体数值
4. **必须使用实体已有的核心指标 key**，不要发明新的指标名

## 世界观
${input.worldPremise}

## 当前状态
Tick: ${input.tick}
世界基调: ${input.world_mood}
${narrativeThreadBlock}
${stateNarrativeBlock}

### 组织
${orgContext}

### 地区
${regionContext}

### 角色
${charContext}

### 最近事件
${recentContext || '无'}
${commandBlock}
${mathBlock}
${entityMemoryBlock}

## 规则
1. 神谕命令必须优先响应
2. 不要生成"世界平静无事"的空事件
3. 每个事件必须有实质性内容
4. **affects 中的指标 key 必须是实体"核心指标"中列出的 key**（如 treasury、food_supply、unrest 等），不要发明新 key
5. 每个事件的影响应该有因果逻辑（战争→军心↓、国库↓；贸易→国库↑、贸易收入↑）
6. 用 ${lang} 输出
7. **新事件必须承接剧情线**——如果剧情线说"帝国在扩军"，那么本 tick 应该是扩军的后果（邻国反应、内部压力、资源消耗），而不是重新开始一个无关的故事
8. **每个事件必须有 caused_by**——标注这个事件是由什么引发的（如"帝国扩军导致邻国恐慌"）

## 输出格式
\`\`\`json
{
  "events": [
    {
      "type": "trade|battle|negotiation|disaster|discovery|rebellion|alliance|other",
      "title": "事件标题",
      "summary": "事件摘要",
      "detail": "详细描述（可选）",
      "actor_ids": ["实体ID"],
      "target_ids": ["实体ID"],
      "location_region_id": "地区ID（可选）",
      "importance": 0.7,
      "affects": [
        { "entity_id": "组织ID", "entity_type": "organization", "metrics": ["treasury↑", "unrest↓"] },
        { "entity_id": "地区ID", "entity_type": "region", "metrics": ["grain_output↓"] }
      ],
      "tags": ["标签"],
      "caused_by": "引发此事件的前因（如：帝国扩军导致粮食危机）"
    }
  ],
  "world_mood": "新的世界基调",
  "tick_narrative": "本 tick 的总体叙事描述（2-3句话，概括本tick最重要的发展）"
}
\`\`\``
}

// ─── Main ───

export async function generateStoryEvents(input: StoryAgentInput): Promise<StoryAgentOutput> {
  const prompt = buildStoryPrompt(input)

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = parseLLMJSON<any>(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Story Agent returned invalid JSON')
    }

    const events: StoryEvent[] = (parsed.events ?? []).map((e: any) => ({
      type: String(e.type ?? 'other'),
      title: String(e.title ?? '未知事件'),
      summary: String(e.summary ?? ''),
      detail: e.detail ? String(e.detail) : undefined,
      actor_ids: Array.isArray(e.actor_ids) ? e.actor_ids.map(String) : [],
      target_ids: Array.isArray(e.target_ids) ? e.target_ids.map(String) : [],
      location_region_id: e.location_region_id ? String(e.location_region_id) : undefined,
      importance: typeof e.importance === 'number' ? Math.max(0, Math.min(1, e.importance)) : 0.5,
      affects: Array.isArray(e.affects) ? e.affects.map((a: any) => ({
        entity_id: String(a.entity_id ?? ''),
        entity_type: String(a.entity_type ?? 'organization') as StoryEventAffect['entity_type'],
        metrics: Array.isArray(a.metrics) ? a.metrics.map(String) : [],
      })) : [],
      tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
      caused_by: e.caused_by ? String(e.caused_by) : undefined,
    }))

    return {
      events,
      world_mood: String(parsed.world_mood ?? input.world_mood),
      tick_narrative: String(parsed.tick_narrative ?? ''),
    }
  } catch (err) {
    console.error('[story-agent] LLM generation failed:', err)
    return {
      events: [],
      world_mood: input.world_mood,
      tick_narrative: '世界在沉默中前行。',
    }
  }
}
