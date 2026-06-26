/**
 * Formula Agent — periodically reviews and adjusts custom metric formulas.
 * Triggers: every 20 ticks, monotonic trends, boundary hits, major events.
 * Ensures formulas remain balanced and produce interesting dynamics.
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { MetricDefinition, MetricValues, FormulaChange } from '@/core/sim/metric-schema'
import { validateFormula } from '@/core/sim/formula-engine'

// ─── Types ───

export type FormulaAgentOrgInput = {
  id: string
  name: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
}

export type FormulaAgentRegionInput = {
  id: string
  name: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
}

export type FormulaAgentInput = {
  tick: number
  language: string
  organizations: FormulaAgentOrgInput[]
  regions: FormulaAgentRegionInput[]
  recent_history: Array<{
    tick: number
    organizations: Array<{ id: string; custom_metrics: MetricValues }>
    regions: Array<{ id: string; custom_metrics: MetricValues }>
  }>
  recent_events: Array<{ title: string; summary: string; tick: number }>
  trigger: 'periodic' | 'major_event' | 'boundary_hit' | 'monotonic'
  trigger_details?: string
}

export type FormulaAgentOutput = {
  formula_changes: FormulaChange[]
  new_metrics: Array<{
    entity_id: string
    entity_type: 'organization' | 'region'
    metric: MetricDefinition
    initial_value: number
  }>
  scale_adjustments: Array<{
    entity_id: string
    metric_key: string
    new_max: number
    reason: string
  }>
  reasoning: string
}

// ─── Analysis helpers ───

function analyzeTrends(
  entityId: string,
  metricKey: string,
  history: FormulaAgentInput['recent_history'],
  entityField: 'organizations' | 'regions',
): { trend: 'rising' | 'falling' | 'stable' | 'volatile'; consecutive: number; hitBoundary: boolean } {
  const values: number[] = []
  for (const snapshot of history) {
    const entities = snapshot[entityField]
    const entity = entities.find(e => e.id === entityId)
    if (entity && entity.custom_metrics[metricKey] !== undefined) {
      values.push(entity.custom_metrics[metricKey])
    }
  }

  if (values.length < 3) return { trend: 'stable', consecutive: 0, hitBoundary: false }

  let rising = 0
  let falling = 0
  let maxConsecutive = 0
  let currentStreak = 0
  let lastDir: 'up' | 'down' | 'flat' = 'flat'

  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff > 0) {
      rising++
      if (lastDir === 'up') currentStreak++
      else currentStreak = 1
      lastDir = 'up'
    } else if (diff < 0) {
      falling++
      if (lastDir === 'down') currentStreak++
      else currentStreak = 1
      lastDir = 'down'
    } else {
      currentStreak = 0
      lastDir = 'flat'
    }
    maxConsecutive = Math.max(maxConsecutive, currentStreak)
  }

  const total = values.length - 1
  const trend = rising / total > 0.7 ? 'rising' :
                falling / total > 0.7 ? 'falling' :
                maxConsecutive <= 2 ? 'stable' : 'volatile'

  // Check if value hit boundary in last 3 snapshots
  const recent = values.slice(-3)
  const hitBoundary = recent.some(v => v <= 1 || v >= 99) // rough boundary check

  return { trend, consecutive: maxConsecutive, hitBoundary }
}

// ─── Prompt ───

function buildFormulaPrompt(input: FormulaAgentInput): string {
  const orgContext = input.organizations.map(o => {
    const metricLines = o.custom_metric_defs
      .map(d => {
        const val = o.custom_metrics[d.key] ?? d.initial
        const formula = o.custom_formulas[d.key] ?? '无公式'
        return `    ${d.name}(${d.key})=${val} [${d.min},${d.max}] 公式: ${formula}`
      })
      .join('\n')

    // Analyze trends
    const trendLines = o.custom_metric_defs
      .map(d => {
        const trend = analyzeTrends(o.id, d.key, input.recent_history, 'organizations')
        if (trend.trend !== 'stable') {
          return `    ⚠ ${d.name}: ${trend.trend} (连续${trend.consecutive}tick)${trend.hitBoundary ? ' [触碰边界]' : ''}`
        }
        return null
      })
      .filter(Boolean)
      .join('\n')

    return `- [${o.id}] ${o.name}\n  指标:\n${metricLines}${trendLines ? `\n  趋势:\n${trendLines}` : ''}`
  }).join('\n\n')

  const regionContext = input.regions.map(r => {
    const metricLines = r.custom_metric_defs
      .map(d => {
        const val = r.custom_metrics[d.key] ?? d.initial
        const formula = r.custom_formulas[d.key] ?? '无公式'
        return `    ${d.name}(${d.key})=${val} [${d.min},${d.max}] 公式: ${formula}`
      })
      .join('\n')
    return `- [${r.id}] ${r.name}\n  指标:\n${metricLines}`
  }).join('\n\n')

  const eventContext = input.recent_events.slice(-5)
    .map(e => `- [Tick ${e.tick}] ${e.title}: ${e.summary}`)
    .join('\n')

  const triggerDesc = {
    periodic: '定期审查（每 20 tick）',
    major_event: '重大事件触发',
    boundary_hit: '指标触碰边界',
    monotonic: '指标单调变化',
  }[input.trigger]

  return `你是一个世界模拟引擎的数值策划师。你的任务是审查和调整自定义指标的数学公式。

## 触发原因
${triggerDesc}${input.trigger_details ? `: ${input.trigger_details}` : ''}

## 当前状态（Tick ${input.tick}）

### 组织
${orgContext || '无'}

### 地区
${regionContext || '无'}

### 最近事件
${eventContext || '无'}

## 审查规则
1. 如果某指标连续 10+ tick 单调增/减，调整公式增加反向力
2. 如果某指标触碰 min/max 边界，调整公式或扩大范围
3. 如果所有公式都稳定，可以不改
4. 新公式必须包含衰减/消耗项（防止只增不减）
5. 每次最多修改 3 个公式（避免剧烈波动）
6. 公式中只能使用四则运算和括号

## 输出格式
\`\`\`json
{
  "formula_changes": [
    {
      "entity_id": "实体ID",
      "entity_type": "organization|region",
      "metric_key": "指标key",
      "old_formula": "旧公式",
      "new_formula": "新公式",
      "reason": "修改原因"
    }
  ],
  "new_metrics": [
    {
      "entity_id": "实体ID",
      "entity_type": "organization|region",
      "metric": { "key": "new_metric", "name": "新指标", "min": 0, "max": 100, "initial": 50 },
      "initial_value": 50
    }
  ],
  "scale_adjustments": [
    {
      "entity_id": "实体ID",
      "metric_key": "指标key",
      "new_max": 200,
      "reason": "扩大范围原因"
    }
  ],
  "reasoning": "整体审查说明"
}
\`\`\``
}

// ─── Post-processing ───

function findEntityFormulas(
  entityId: string,
  input: FormulaAgentInput,
): Record<string, string> | null {
  const org = input.organizations.find(o => o.id === entityId)
  if (org) return org.custom_formulas
  const region = input.regions.find(r => r.id === entityId)
  if (region) return region.custom_formulas
  return null
}

function findEntityMetricDefs(
  entityId: string,
  input: FormulaAgentInput,
): MetricDefinition[] {
  const org = input.organizations.find(o => o.id === entityId)
  if (org) return org.custom_metric_defs
  const region = input.regions.find(r => r.id === entityId)
  if (region) return region.custom_metric_defs
  return []
}

// ─── Main ───

export async function generateFormulaAdjustments(input: FormulaAgentInput): Promise<FormulaAgentOutput> {
  const prompt = buildFormulaPrompt(input)

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = parseLLMJSON<any>(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Formula Agent returned invalid JSON')
    }

    // Validate and process formula changes
    const formulaChanges: FormulaChange[] = []
    for (const change of parsed.formula_changes ?? []) {
      const entityId = String(change.entity_id ?? '')
      const entityType = String(change.entity_type ?? 'organization') as FormulaChange['entity_type']
      const metricKey = String(change.metric_key ?? '')
      const newFormula = String(change.new_formula ?? '')
      const reason = String(change.reason ?? '')

      if (!entityId || !metricKey || !newFormula) continue

      // Validate new formula
      const existingDefs = findEntityMetricDefs(entityId, input)
      const existingFormulas = findEntityFormulas(entityId, input) ?? {}
      const availableVars = [
        ...existingDefs.map(d => d.key),
        ...Object.keys(existingFormulas),
        'military_strength', 'economic_power', 'influence_score', 'cohesion',
        'public_reputation', 'resources', 'population',
      ]

      const validation = validateFormula(newFormula, availableVars)
      if (!validation.valid) {
        console.warn(`[formula-agent] Invalid formula for ${entityId}.${metricKey}: ${validation.error}`)
        continue
      }

      // Limit: max 3 formula changes per call
      if (formulaChanges.length >= 3) break

      formulaChanges.push({
        tick: input.tick,
        entity_id: entityId,
        entity_type: entityType,
        metric_key: metricKey,
        old_formula: String(change.old_formula ?? existingFormulas[metricKey] ?? ''),
        new_formula: newFormula,
        reason,
      })
    }

    // Process new metrics
    const newMetrics = (parsed.new_metrics ?? []).map((m: any) => ({
      entity_id: String(m.entity_id ?? ''),
      entity_type: String(m.entity_type ?? 'organization') as 'organization' | 'region',
      metric: {
        key: String(m.metric?.key ?? ''),
        name: String(m.metric?.name ?? ''),
        min: Number(m.metric?.min ?? 0),
        max: Number(m.metric?.max ?? 100),
        initial: Number(m.metric?.initial ?? 50),
        unit: m.metric?.unit ? String(m.metric.unit) : undefined,
      },
      initial_value: Number(m.initial_value ?? m.metric?.initial ?? 50),
    }))

    // Process scale adjustments
    const scaleAdjustments = (parsed.scale_adjustments ?? []).map((s: any) => ({
      entity_id: String(s.entity_id ?? ''),
      metric_key: String(s.metric_key ?? ''),
      new_max: Number(s.new_max ?? 100),
      reason: String(s.reason ?? ''),
    }))

    return {
      formula_changes: formulaChanges,
      new_metrics: newMetrics,
      scale_adjustments: scaleAdjustments,
      reasoning: String(parsed.reasoning ?? ''),
    }
  } catch (err) {
    console.error('[formula-agent] LLM generation failed:', err)
    return {
      formula_changes: [],
      new_metrics: [],
      scale_adjustments: [],
      reasoning: 'Formula Agent failed to generate adjustments.',
    }
  }
}

/**
 * Check if Formula Agent should be triggered.
 */
export function shouldTriggerFormulaAgent(
  tick: number,
  history: FormulaAgentInput['recent_history'],
  organizations: FormulaAgentOrgInput[],
): { trigger: boolean; reason: string } {
  // Periodic: every 20 ticks
  if (tick > 0 && tick % 20 === 0) {
    return { trigger: true, reason: `定期审查 (tick ${tick})` }
  }

  // Check for monotonic trends or boundary hits
  for (const org of organizations) {
    for (const def of org.custom_metric_defs) {
      const trend = analyzeTrends(org.id, def.key, history, 'organizations')
      if (trend.consecutive >= 10) {
        return { trigger: true, reason: `${org.name}.${def.name} 连续 ${trend.consecutive} tick ${trend.trend}` }
      }
      if (trend.hitBoundary) {
        return { trigger: true, reason: `${org.name}.${def.name} 触碰边界` }
      }
    }
  }

  return { trigger: false, reason: '' }
}
