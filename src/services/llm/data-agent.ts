/**
 * Data Agent — translates narrative events into concrete numerical changes.
 * Receives Story Agent's output and calculates specific delta values
 * for custom metrics, respecting constraints.
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { MetricDefinition, MetricValues, DataChange } from '@/core/sim/metric-schema'
import type { StoryEvent } from './story-agent'

// ─── Types ───

export type DataAgentOrgInput = {
  id: string
  name: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
  influence_score: number
  military_strength: number
  economic_power: number
  cohesion: number
  public_reputation: number
  resources: number
  population: number
}

export type DataAgentRegionInput = {
  id: string
  name: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
  danger_level: number
  prosperity: number
  population: number
}

export type DataAgentCharInput = {
  id: string
  name: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  // 20 属性
  vitality: number
  health: number
  energy: number
  stress: number
  aging: number
  morale: number
  focus: number
  sanity: number
  influence: number
  reputation: number
  standing: number
  loyalty: number
  wealth: number
  army: number
  retainers: number
  secrets: number
  martial: number
  cunning: number
  charisma: number
  lore: number
  condition?: string
}

export type DataAgentInput = {
  tick: number
  story_events: StoryEvent[]
  organizations: DataAgentOrgInput[]
  regions: DataAgentRegionInput[]
  characters: DataAgentCharInput[]
  global_variables?: Record<string, number>
  math_changes?: string
}

export type DataAgentOutput = {
  changes: DataChange[]
  new_metrics: Array<{
    entity_id: string
    entity_type: 'organization' | 'character' | 'region'
    key: string
    name: string
    initial: number
    min: number
    max: number
    unit?: string
  }>
  warnings: string[]
}

// ─── Prompt ───

function buildDataPrompt(input: DataAgentInput): string {
  const orgContext = input.organizations.map(o => {
    const metricLines = o.custom_metric_defs
      .map(d => {
        const val = o.custom_metrics[d.key] ?? d.initial
        const range = `[${d.min}, ${d.max}]`
        const formula = o.custom_formulas[d.key]
        return `    ${d.name}(${d.key})=${val} ${range}${d.unit ? ' ' + d.unit : ''}${formula ? `  公式: ${formula}` : ''}`
      })
      .join('\n')
    return `- [${o.id}] ${o.name}\n  标准: influence=${o.influence_score}, military=${o.military_strength}, economic=${o.economic_power}, cohesion=${o.cohesion}, reputation=${o.public_reputation}, resources=${o.resources}, population=${o.population}\n  自定义指标（优先修改这些）:\n${metricLines}`
  }).join('\n\n')

  const regionContext = input.regions.map(r => {
    const metricLines = r.custom_metric_defs
      .map(d => {
        const val = r.custom_metrics[d.key] ?? d.initial
        const formula = r.custom_formulas[d.key]
        return `    ${d.name}(${d.key})=${val} [${d.min}, ${d.max}]${formula ? `  公式: ${formula}` : ''}`
      })
      .join('\n')
    return `- [${r.id}] ${r.name}\n  标准: danger=${r.danger_level}, prosperity=${r.prosperity}, population=${r.population}\n  自定义指标（优先修改这些）:\n${metricLines}`
  }).join('\n\n')

  const charContext = input.characters.map(c => {
    const metricLines = c.custom_metric_defs
      .map(d => {
        const val = c.custom_metrics[d.key] ?? d.initial
        return `    ${d.name}(${d.key})=${val} [${d.min}, ${d.max}]`
      })
      .join('\n')
    const stats = [
      `生命${c.vitality}`, `健康${c.health}`, `体力${c.energy}`, `压力${c.stress}`, `衰老${c.aging}`,
      `士气${c.morale}`, `集中${c.focus}`, `理智${c.sanity}`,
      `影响${c.influence}`, `声望${c.reputation}`, `地位${c.standing}`, `忠诚${c.loyalty}`,
      `财富${c.wealth}`, `兵力${c.army}`, `追随${c.retainers}`, `秘密${c.secrets}`,
      `武力${c.martial}`, `谋略${c.cunning}`, `魅力${c.charisma}`, `学识${c.lore}`,
    ].join(', ')
    return `- [${c.id}] ${c.name}${c.condition ? ` [${c.condition}]` : ''}\n  20属性: ${stats}\n  自定义指标（优先修改这些）:\n${metricLines}`
  }).join('\n\n')

  const eventContext = input.story_events
    .map(e => {
      const affects = e.affects
        .map(a => `  → ${a.entity_id}(${a.entity_type}): ${a.metrics.join(', ')}`)
        .join('\n')
      return `- [${e.type}] ${e.title}: ${e.summary}\n${affects}`
    })
    .join('\n\n')

  const mathBlock = input.math_changes
    ? `\n## 数学引擎变化（已有确定性变化，你的 delta 是额外叠加）\n${input.math_changes}`
    : ''

  return `你是一个世界模拟引擎的数据层。Story Agent 已经生成了叙事事件，你的任务是将每个事件翻译成具体的数值变化。

## 叙事事件
${eventContext || '无事件'}
${mathBlock}

## 当前实体状态（含公式）

### 组织
${orgContext}

### 地区
${regionContext}

### 角色
${charContext}

## 核心规则

### ⚠️ 优先修改已有指标，不要随意创建新指标
每个实体都有一组"自定义指标"，这些是世界创建时定义的核心数据系统。
你 **必须优先修改这些已有指标**，而不是创建新的指标。
只有当叙事事件的影响确实无法映射到任何已有指标时，才允许创建新指标（最多每 tick 新增 2 个）。

### 参考公式计算 delta
每个指标旁边有"公式:"标注，这是该指标的数学变化规律。
你应该参考公式的逻辑来决定 delta：
- 如果公式是 \`treasury + trade_income * 0.1 - military * 50\`，而 trade_income=500000, military=50000，那么 treasury 的公式预期变化是 +50000 - 2500000 = -2450000
- 你的 delta 应该在这个数量级附近，不要给一个完全无关的数值（如 +5）
- 但你不是直接执行公式（数学引擎会做），你是在叙事事件的语境下给出"额外影响"

### 数值范围约束
1. 单 tick 单指标最大变化 = max(5, 该指标 range 的 10%)
2. 不能直接设置值，只能给 delta（正数=增加，负数=减少）
3. delta 必须在合理范围内，不要极端值
4. 只修改事件 affects 中标注了方向的指标
5. 如果某个事件的影响不明确，可以不给 delta

## 输出格式
\`\`\`json
{
  "changes": [
    {
      "entity_id": "实体ID",
      "entity_type": "organization|character|region",
      "metric_key": "已有指标key 或 极少数新指标key",
      "delta": -15000,
      "reason": "原因说明（引用公式逻辑或叙事依据）"
    }
  ],
  "new_metrics": [
    {
      "entity_id": "实体ID",
      "entity_type": "organization|character|region",
      "key": "仅在必要时新增",
      "name": "显示名",
      "initial": 50,
      "min": 0,
      "max": 100,
      "unit": ""
    }
  ],
  "warnings": ["warning: org_1.treasury 接近下限 0"]
}
\`\`\``
}

// ─── Post-processing ───

function clampDelta(
  delta: number,
  metricDef: MetricDefinition | undefined,
  currentValue: number,
): number {
  if (!metricDef) return Math.max(-50, Math.min(50, delta))

  const range = metricDef.max - metricDef.min
  const maxDelta = Math.max(5, range * 0.1)
  return Math.max(-maxDelta, Math.min(maxDelta, delta))
}

function findMetricDef(
  entityId: string,
  metricKey: string,
  input: DataAgentInput,
): { def: MetricDefinition | undefined; currentValue: number } {
  const org = input.organizations.find(o => o.id === entityId)
  if (org) {
    const def = org.custom_metric_defs.find(d => d.key === metricKey)
    return { def, currentValue: org.custom_metrics[metricKey] ?? def?.initial ?? 0 }
  }

  const region = input.regions.find(r => r.id === entityId)
  if (region) {
    const def = region.custom_metric_defs.find(d => d.key === metricKey)
    return { def, currentValue: region.custom_metrics[metricKey] ?? def?.initial ?? 0 }
  }

  const char = input.characters.find(c => c.id === entityId)
  if (char) {
    const def = char.custom_metric_defs.find(d => d.key === metricKey)
    return { def, currentValue: char.custom_metrics[metricKey] ?? def?.initial ?? 0 }
  }

  return { def: undefined, currentValue: 0 }
}

// ─── Main ───

export async function generateDataChanges(input: DataAgentInput): Promise<DataAgentOutput> {
  if (input.story_events.length === 0) {
    return { changes: [], new_metrics: [], warnings: [] }
  }

  const prompt = buildDataPrompt(input)

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = parseLLMJSON<any>(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Data Agent returned invalid JSON')
    }

    const changes: DataChange[] = []
    const warnings: string[] = []

    for (const rawChange of parsed.changes ?? []) {
      const entityId = String(rawChange.entity_id ?? '')
      const entityType = String(rawChange.entity_type ?? 'organization') as DataChange['entity_type']
      const metricKey = String(rawChange.metric_key ?? '')
      const rawDelta = Number(rawChange.delta ?? 0)
      const reason = String(rawChange.reason ?? '')

      if (!entityId || !metricKey || !Number.isFinite(rawDelta)) continue

      const { def, currentValue } = findMetricDef(entityId, metricKey, input)
      const clampedDelta = clampDelta(rawDelta, def, currentValue)

      changes.push({
        entity_id: entityId,
        entity_type: entityType,
        metric_key: metricKey,
        delta: clampedDelta,
        reason,
      })

      // Generate warnings for boundary proximity
      if (def) {
        const nextValue = currentValue + clampedDelta
        const range = def.max - def.min
        const threshold = range * 0.1
        if (nextValue - def.min < threshold) {
          warnings.push(`warning: ${entityId}.${metricKey} 接近下限 ${def.min}`)
        }
        if (def.max - nextValue < threshold) {
          warnings.push(`warning: ${entityId}.${metricKey} 接近上限 ${def.max}`)
        }
      }
    }

    // Process new metrics (max 2 per tick)
    const newMetrics = (parsed.new_metrics ?? []).slice(0, 2).map((m: any) => ({
      entity_id: String(m.entity_id ?? ''),
      entity_type: String(m.entity_type ?? 'organization') as 'organization' | 'character' | 'region',
      key: String(m.key ?? ''),
      name: String(m.name ?? ''),
      initial: Number(m.initial ?? 50),
      min: Number(m.min ?? 0),
      max: Number(m.max ?? 100),
      unit: m.unit ? String(m.unit) : undefined,
    })).filter((m: any) => m.entity_id && m.key)

    for (const w of parsed.warnings ?? []) {
      if (typeof w === 'string') warnings.push(w)
    }

    return { changes, new_metrics: newMetrics, warnings }
  } catch (err) {
    console.error('[data-agent] LLM generation failed:', err)
    return { changes: [], new_metrics: [], warnings: ['Data Agent failed to generate changes'] }
  }
}
