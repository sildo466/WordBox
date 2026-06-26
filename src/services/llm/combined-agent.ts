/**
 * Combined Story+Data Agent — generates narrative events AND numerical changes
 * in a single LLM call, eliminating the sequential Story→Data bottleneck.
 *
 * This replaces the two-step pipeline (story-agent → data-agent) with one call,
 * cutting tick latency roughly in half.
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { GodCommand } from '@/core/sim/command'
import type { MetricDefinition, MetricValues, DataChange } from '@/core/sim/metric-schema'

// ─── Types (re-export for convenience) ───

export type StoryEventAffect = {
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  metrics: string[]
}

export type CombinedEvent = {
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
  caused_by?: string
  // Numerical effects (from Data Agent logic)
  effects?: Array<{
    target_type: string
    target_id: string
    field: string
    delta: number
    description: string
  }>
}

export type CombinedAgentInput = {
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
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string; min?: number; max?: number }>
    custom_formulas?: Record<string, string>
    influence_score?: number
    military_strength?: number
    economic_power?: number
    cohesion?: number
    public_reputation?: number
    resources?: number
    population?: number
  }>
  regions: Array<{
    id: string
    name: string
    terrain: string
    description?: string
    custom_metrics?: Record<string, number>
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string; min?: number; max?: number }>
    custom_formulas?: Record<string, string>
    danger_level?: number
    prosperity?: number
    population?: number
  }>
  characters: Array<{
    id: string
    name: string
    status: string
    organization_id: string | null
    custom_metrics?: Record<string, number>
    custom_metric_defs?: Array<{ key: string; name: string; unit?: string; min?: number; max?: number }>
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
  narrative_thread?: string
  state_narrative?: string
}

export type CombinedAgentOutput = {
  events: CombinedEvent[]
  world_mood: string
  tick_narrative: string
  data_changes: DataChange[]
}

// ─── Prompt ───

function buildCombinedPrompt(input: CombinedAgentInput): string {
  const lang = input.language === 'zh' ? '中文' : 'English'

  const orgContext = input.organizations.map(o => {
    let line = `- [${o.id}] ${o.name} (${o.type}, ${o.status}): ${o.description}`
    if (o.custom_metrics && o.custom_metric_defs && o.custom_metric_defs.length > 0) {
      const metrics = o.custom_metric_defs
        .map(d => {
          const val = o.custom_metrics![d.key] ?? '?'
          const range = d.min != null && d.max != null ? ` [${d.min},${d.max}]` : ''
          const formula = o.custom_formulas?.[d.key]
          return `${d.name}(${d.key})=${val}${range}${formula ? ` 公式:${formula}` : ''}`
        })
        .join(', ')
      line += `\n  核心指标: ${metrics}`
    }
    if (o.influence_score != null) line += `\n  标准: influence=${o.influence_score}, military=${o.military_strength ?? 0}, economic=${o.economic_power ?? 0}, cohesion=${o.cohesion ?? 0}, reputation=${o.public_reputation ?? 0}, resources=${o.resources ?? 0}`
    return line
  }).join('\n')

  const regionContext = input.regions.map(r => {
    let line = `- [${r.id}] ${r.name} (${r.terrain}): ${r.description ?? ''}`
    if (r.custom_metrics && r.custom_metric_defs && r.custom_metric_defs.length > 0) {
      const metrics = r.custom_metric_defs
        .map(d => {
          const val = r.custom_metrics![d.key] ?? '?'
          const range = d.min != null && d.max != null ? ` [${d.min},${d.max}]` : ''
          const formula = r.custom_formulas?.[d.key]
          return `${d.name}(${d.key})=${val}${range}${formula ? ` 公式:${formula}` : ''}`
        })
        .join(', ')
      line += `\n  核心指标: ${metrics}`
    }
    if (r.danger_level != null) line += `\n  标准: danger=${r.danger_level}, prosperity=${r.prosperity ?? 0}, population=${r.population ?? 0}`
    return line
  }).join('\n')

  const charContext = input.characters.map(c => {
    let line = `- [${c.id}] ${c.name} (${c.status})${c.condition ? ` [${c.condition}]` : ''}${c.organization_id ? ` [${c.organization_id}]` : ''}`
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
        .map(d => `${d.name}(${d.key})=${c.custom_metrics![d.key] ?? '?'} [${d.min ?? 0},${d.max ?? 100}]`)
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

  return `你是一个世界模拟引擎的叙事+数据层。你同时负责生成故事情节和具体的数值变化。

## 你的职责
1. 为每个 tick 生成 1-5 个叙事事件（故事情节）
2. 为每个事件标注影响哪些实体的哪些**已有核心指标**的方向（↑ 或 ↓）
3. 同时为每个事件生成具体的数值 delta（参考公式和当前值）
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
4. **affects 中的指标 key 必须是实体"核心指标"中列出的 key**
5. 每个事件的影响应该有因果逻辑
6. 用 ${lang} 输出
7. **新事件必须承接剧情线**
8. **每个事件必须有 caused_by**
9. **effects 的 delta 必须参考公式和当前值**，不要给完全无关的数值
10. 单 tick 单指标最大变化 = max(5, 该指标 range 的 10%)
11. 只修改事件 affects 中标注了方向的指标
12. **delta 要有足够力度**——战争应使 influence 下降 3-8，经济繁荣应使 economic_power 上涨 5-15，不要只给 ±1 的微小变化
13. **不同势力的 delta 要有差异**——同一个事件对不同势力的影响应该不同（盟友受益、敌人受损）

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
        { "entity_id": "组织ID", "entity_type": "organization", "metrics": ["treasury↑", "unrest↓"] }
      ],
      "effects": [
        { "target_type": "organization", "target_id": "组织ID", "field": "custom_metrics.treasury", "delta": 5000, "description": "贸易收入增加" }
      ],
      "tags": ["标签"],
      "caused_by": "引发此事件的前因"
    }
  ],
  "world_mood": "新的世界基调",
  "tick_narrative": "本 tick 的总体叙事描述（2-3句话）"
}
\`\`\``
}

// ─── Post-processing ───

function clampDelta(delta: number, min?: number, max?: number): number {
  if (min == null || max == null) return Math.max(-50, Math.min(50, delta))
  const range = max - min
  const maxDelta = Math.max(5, range * 0.1)
  return Math.max(-maxDelta, Math.min(maxDelta, delta))
}

// ─── Main ───

export async function generateCombinedEvents(input: CombinedAgentInput): Promise<CombinedAgentOutput> {
  const prompt = buildCombinedPrompt(input)

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = parseLLMJSON<any>(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Combined Agent returned invalid JSON')
    }

    const events: CombinedEvent[] = (parsed.events ?? []).map((e: any) => ({
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
      effects: Array.isArray(e.effects) ? e.effects.map((ef: any) => ({
        target_type: String(ef.target_type ?? 'organization'),
        target_id: String(ef.target_id ?? ''),
        field: String(ef.field ?? ''),
        delta: typeof ef.delta === 'number' ? ef.delta : Number(ef.delta ?? 0),
        description: String(ef.description ?? ''),
      })).filter((ef: any) => ef.target_id && ef.field && ef.delta !== 0) : [],
    }))

    // Clamp deltas based on metric definitions
    const orgMap = new Map(input.organizations.map(o => [o.id, o]))
    const regionMap = new Map(input.regions.map(r => [r.id, r]))
    const charMap = new Map(input.characters.map(c => [c.id, c]))

    for (const event of events) {
      if (!event.effects) continue
      for (const effect of event.effects) {
        // Extract metric key from field like "custom_metrics.treasury"
        const metricKey = effect.field.replace('custom_metrics.', '')
        let min: number | undefined
        let max: number | undefined

        const org = orgMap.get(effect.target_id)
        if (org) {
          const def = org.custom_metric_defs?.find(d => d.key === metricKey)
          if (def) { min = def.min; max = def.max }
        }
        const region = regionMap.get(effect.target_id)
        if (region) {
          const def = region.custom_metric_defs?.find(d => d.key === metricKey)
          if (def) { min = def.min; max = def.max }
        }
        const char = charMap.get(effect.target_id)
        if (char) {
          const def = char.custom_metric_defs?.find(d => d.key === metricKey)
          if (def) { min = def.min; max = def.max }
        }

        effect.delta = clampDelta(effect.delta, min, max)
      }
    }

    // Convert effects to DataChange format
    const dataChanges: DataChange[] = []
    for (const event of events) {
      if (!event.effects) continue
      for (const ef of event.effects) {
        dataChanges.push({
          entity_id: ef.target_id,
          entity_type: ef.target_type as DataChange['entity_type'],
          metric_key: ef.field.replace('custom_metrics.', ''),
          delta: ef.delta,
          reason: ef.description || event.title,
        })
      }
    }

    return {
      events,
      world_mood: String(parsed.world_mood ?? input.world_mood),
      tick_narrative: String(parsed.tick_narrative ?? ''),
      data_changes: dataChanges,
    }
  } catch (err) {
    console.error('[combined-agent] LLM generation failed:', err)
    return {
      events: [],
      world_mood: input.world_mood,
      tick_narrative: '世界在沉默中前行。',
      data_changes: [],
    }
  }
}
