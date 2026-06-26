/**
 * World Builder Agent — generates custom metrics, formulas, and scales
 * for all organizations, regions, and characters during world creation.
 *
 * This agent runs AFTER world-gen and org-gen, enriching entities with
 * world-specific numerical systems (e.g., a medieval kingdom gets
 * granary/unrest/tax_rate, while a space empire gets energy/colony_loyalty).
 */

import { createLLMClient, getModel, callLLM } from './client'
import { parseLLMJSON } from './json-repair'
import type { MetricDefinition, MetricValues, ScaleDefinition } from '@/core/sim/metric-schema'
import { validateFormula } from '@/core/sim/formula-engine'
import { MIN_CUSTOM_METRICS } from '@/core/sim/metric-schema'

// ─── Types ───

export type WorldBuilderInput = {
  worldPremise: string
  language: string
  organizations: Array<{
    id: string
    name: string
    type: string
    description: string
    ideology: string
  }>
  regions: Array<{
    id: string
    name: string
    terrain: string
    description?: string
  }>
  characters: Array<{
    id: string
    name: string
    description: string
    organization_id?: string | null
  }>
}

export type WorldBuilderOrgOutput = {
  id: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
  scale: ScaleDefinition
  population: number
}

export type WorldBuilderRegionOutput = {
  id: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
  custom_formulas: Record<string, string>
}

export type WorldBuilderCharOutput = {
  id: string
  custom_metrics: MetricValues
  custom_metric_defs: MetricDefinition[]
}

export type WorldBuilderOutput = {
  organizations: WorldBuilderOrgOutput[]
  regions: WorldBuilderRegionOutput[]
  characters: WorldBuilderCharOutput[]
  global_variables: Record<string, number>
}

// ─── Prompt construction ───

function buildWorldBuilderPrompt(input: WorldBuilderInput): string {
  const orgList = input.organizations
    .map(o => `- [${o.id}] ${o.name} (${o.type}): ${o.description} | 意识形态: ${o.ideology}`)
    .join('\n')

  const regionList = input.regions
    .map(r => `- [${r.id}] ${r.name} (${r.terrain}): ${r.description ?? '无描述'}`)
    .join('\n')

  const charList = input.characters
    .map(c => `- [${c.id}] ${c.name}: ${c.description}${c.organization_id ? ` (隶属: ${c.organization_id})` : ''}`)
    .join('\n')

  const lang = input.language === 'zh' ? '中文' : 'English'

  return `你是一个世界模拟引擎的数值策划师。你的任务是为以下世界的每个组织、地区、角色设计专属的数值指标和数学公式。

世界观：
${input.worldPremise}

现有组织：
${orgList}

现有地区：
${regionList}

现有角色：
${charList}

## 要求

### 组织指标（每个组织至少 ${MIN_CUSTOM_METRICS} 个）
每个组织必须有专属的数值指标，反映其类型和世界观。例如：
- 中世纪王国: 粮仓(granary)、民怨(unrest)、税收(tax_rate)、国库(treasury)、军粮(military_supply)、外交声望(diplomatic_standing)、瘟疫程度(plague_severity)、农业产出(agricultural_output)、商路数量(trade_routes)、贵族忠诚(nobles_loyalty)
- 商人公会: 利润率(profit_margin)、贸易路线(trade_routes)、债务(debt)、货物库存(inventory)、走私风险(smuggling_risk)、市场影响力(market_influence)、信用评级(credit_rating)、船队规模(fleet_size)、关税(tariffs)、竞争对手压力(competitor_pressure)
- 盗贼团: 恐惧值(fear_level)、藏匿物(stash)、官方追捕度(heat)、地盘(turf_count)、线人网络(informant_network)、贿赂支出(bribery_cost)、任务成功率(mission_success_rate)、叛徒风险(traitor_risk)、黑市份额(black_market_share)、声望恶名(notoriety)

### 组织公式（每个指标一个公式）
公式使用四则运算 (+, -, *, /) 和括号，可以引用：
- 自己组织的其他指标
- 世界级变量（global_variables）
- 标准字段: military_strength, economic_power, influence_score, cohesion, public_reputation, resources, population

**关键: 每个公式必须包含至少一个衰减或消耗项**（防止只增不减）。

### 组织量级（scale）
不同组织的数值量级应匹配世界观：
- 帝国: population_base 500000+, economy_base 2000000+
- 盗贼团: population_base 50, economy_base 12000
- 小村庄: population_base 200, economy_base 5000

### 组织人口（population）
每个组织应有合理的人口数（不要求每个都是 SimCharacter）。

### 地区指标（每个地区至少 5 个）
反映地区特色，如: 粮食产量(grain_output)、矿产(minerals)、治安(public_order)、文化繁荣度(cultural_flourishing)、疾病程度(disease_level)

### 角色指标（每个角色至少 3 个）
反映角色特色，如: 声望(reputation)、技能水平(skill_level)、人际关系网络(network_strength)

### 世界级变量
定义全局变量供公式引用，如: global_tension(全球紧张度), tech_level(科技水平), trade_volume(全球贸易量)

## 输出格式

\`\`\`json
{
  "organizations": [
    {
      "id": "组织ID",
      "custom_metrics": { "指标key": 初始值 },
      "custom_metric_defs": [
        { "key": "指标key", "name": "显示名", "min": 0, "max": 100, "initial": 60, "unit": "单位" }
      ],
      "custom_formulas": { "指标key": "公式表达式" },
      "scale": { "population_base": 500000, "economy_base": 2000000, "military_base": 50000, "description": "帝国级" },
      "population": 500000
    }
  ],
  "regions": [
    {
      "id": "地区ID",
      "custom_metrics": { "指标key": 初始值 },
      "custom_metric_defs": [...],
      "custom_formulas": { "指标key": "公式表达式" }
    }
  ],
  "characters": [
    {
      "id": "角色ID",
      "custom_metrics": { "指标key": 初始值 },
      "custom_metric_defs": [...]
    }
  ],
  "global_variables": { "global_tension": 30, "tech_level": 50 }
}
\`\`\`

语言: ${lang}
注意：所有 key 必须是合法的变量名（英文字母、数字、下划线），name 可以用中文。`
}

// ─── Post-processing ───

function validateAndFixOrgOutput(
  raw: any,
  inputOrg: WorldBuilderInput['organizations'][0],
): WorldBuilderOrgOutput {
  const metricDefs: MetricDefinition[] = Array.isArray(raw.custom_metric_defs)
    ? raw.custom_metric_defs.map((d: any) => ({
        key: String(d.key ?? ''),
        name: String(d.name ?? d.key ?? ''),
        min: Number(d.min ?? 0),
        max: Number(d.max ?? 100),
        initial: Number(d.initial ?? 50),
        unit: d.unit ? String(d.unit) : undefined,
      }))
    : []

  // Ensure minimum metric count
  if (metricDefs.length < MIN_CUSTOM_METRICS) {
    console.warn(`[world-builder] Org ${inputOrg.id} has ${metricDefs.length} metrics, minimum is ${MIN_CUSTOM_METRICS}`)
  }

  // Validate formulas
  const formulas: Record<string, string> = {}
  const availableVars = [
    ...metricDefs.map(d => d.key),
    'military_strength', 'economic_power', 'influence_score', 'cohesion',
    'public_reputation', 'resources', 'population',
  ]

  for (const [key, formula] of Object.entries(raw.custom_formulas ?? {})) {
    const validation = validateFormula(String(formula), availableVars)
    if (validation.valid) {
      formulas[key] = String(formula)
    } else {
      console.warn(`[world-builder] Invalid formula for ${inputOrg.id}.${key}: ${validation.error}`)
    }
  }

  // Build metric values from defs
  const metrics: MetricValues = {}
  for (const def of metricDefs) {
    const rawVal = raw.custom_metrics?.[def.key]
    metrics[def.key] = typeof rawVal === 'number' ? Math.max(def.min, Math.min(def.max, rawVal)) : def.initial
  }

  // Ensure scale has realistic defaults based on org type
  const scale = raw.scale ?? {}
  const populationBase = Number(scale.population_base) || estimatePopulation(inputOrg.type)
  const economyBase = Number(scale.economy_base) || estimateEconomy(inputOrg.type)
  const militaryBase = Number(scale.military_base) || estimateMilitary(inputOrg.type)

  return {
    id: inputOrg.id,  // Always use input ID to ensure match
    custom_metrics: metrics,
    custom_metric_defs: metricDefs,
    custom_formulas: formulas,
    scale: {
      population_base: populationBase,
      economy_base: economyBase,
      military_base: militaryBase,
      description: String(scale.description ?? '默认'),
    },
    population: Number(raw.population) || populationBase,
  }
}

function estimatePopulation(type: string): number {
  const map: Record<string, number> = {
    empire: 2000000, kingdom: 500000, republic: 300000,
    tribe: 5000, guild: 500, church: 10000,
    merchant_company: 2000, criminal_syndicate: 500,
    secret_society: 200, mercenary_band: 1000, other: 10000,
  }
  return map[type] ?? 10000
}

function estimateEconomy(type: string): number {
  const map: Record<string, number> = {
    empire: 50000000, kingdom: 10000000, republic: 8000000,
    tribe: 500000, guild: 200000, church: 3000000,
    merchant_company: 5000000, criminal_syndicate: 1000000,
    secret_society: 500000, mercenary_band: 800000, other: 1000000,
  }
  return map[type] ?? 1000000
}

function estimateMilitary(type: string): number {
  const map: Record<string, number> = {
    empire: 200000, kingdom: 50000, republic: 30000,
    tribe: 2000, guild: 100, church: 5000,
    merchant_company: 500, criminal_syndicate: 300,
    secret_society: 50, mercenary_band: 2000, other: 1000,
  }
  return map[type] ?? 1000
}

function validateAndFixRegionOutput(
  raw: any,
  inputRegion: WorldBuilderInput['regions'][0],
): WorldBuilderRegionOutput {
  const metricDefs: MetricDefinition[] = Array.isArray(raw.custom_metric_defs)
    ? raw.custom_metric_defs.map((d: any) => ({
        key: String(d.key ?? ''),
        name: String(d.name ?? d.key ?? ''),
        min: Number(d.min ?? 0),
        max: Number(d.max ?? 100),
        initial: Number(d.initial ?? 50),
        unit: d.unit ? String(d.unit) : undefined,
      }))
    : []

  const formulas: Record<string, string> = {}
  const availableVars = [...metricDefs.map(d => d.key), 'danger_level', 'prosperity', 'population']

  for (const [key, formula] of Object.entries(raw.custom_formulas ?? {})) {
    const validation = validateFormula(String(formula), availableVars)
    if (validation.valid) {
      formulas[key] = String(formula)
    }
  }

  const metrics: MetricValues = {}
  for (const def of metricDefs) {
    const rawVal = raw.custom_metrics?.[def.key]
    metrics[def.key] = typeof rawVal === 'number' ? Math.max(def.min, Math.min(def.max, rawVal)) : def.initial
  }

  return {
    id: inputRegion.id,  // Always use input ID
    custom_metrics: metrics,
    custom_metric_defs: metricDefs,
    custom_formulas: formulas,
  }
}

function validateAndFixCharOutput(
  raw: any,
  inputChar: WorldBuilderInput['characters'][0],
): WorldBuilderCharOutput {
  const metricDefs: MetricDefinition[] = Array.isArray(raw.custom_metric_defs)
    ? raw.custom_metric_defs.map((d: any) => ({
        key: String(d.key ?? ''),
        name: String(d.name ?? d.key ?? ''),
        min: Number(d.min ?? 0),
        max: Number(d.max ?? 100),
        initial: Number(d.initial ?? 50),
        unit: d.unit ? String(d.unit) : undefined,
      }))
    : []

  const metrics: MetricValues = {}
  for (const def of metricDefs) {
    const rawVal = raw.custom_metrics?.[def.key]
    metrics[def.key] = typeof rawVal === 'number' ? Math.max(def.min, Math.min(def.max, rawVal)) : def.initial
  }

  return {
    id: inputChar.id,  // Always use input ID
    custom_metrics: metrics,
    custom_metric_defs: metricDefs,
  }
}

// ─── Main entry ───

export async function generateWorldBuilderData(input: WorldBuilderInput): Promise<WorldBuilderOutput> {
  if (input.organizations.length === 0 && input.regions.length === 0 && input.characters.length === 0) {
    return { organizations: [], regions: [], characters: [], global_variables: {} }
  }

  const prompt = buildWorldBuilderPrompt(input)

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = parseLLMJSON<any>(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('World Builder returned invalid JSON')
    }

    console.log('[world-builder] LLM returned:', JSON.stringify({
      orgs: (parsed.organizations ?? []).length,
      regions: (parsed.regions ?? []).length,
      chars: (parsed.characters ?? []).length,
      globals: Object.keys(parsed.global_variables ?? {}).length,
    }))

    // Process organizations — match by index if ID doesn't match
    const rawOrgs = parsed.organizations ?? []
    if (rawOrgs.length === 0 && input.organizations.length > 0) {
      console.warn('[world-builder] LLM returned 0 organizations, falling back')
      return generateFallback(input)
    }
    const organizations = input.organizations.map((inputOrg, i) => {
      const raw = rawOrgs[i] ?? rawOrgs.find((r: any) => r.id === inputOrg.id) ?? {}
      return validateAndFixOrgOutput(raw, inputOrg)
    })

    // Process regions — match by index if ID doesn't match
    const rawRegions = parsed.regions ?? []
    const regions = input.regions.map((inputRegion, i) => {
      const raw = rawRegions[i] ?? rawRegions.find((r: any) => r.id === inputRegion.id) ?? {}
      return validateAndFixRegionOutput(raw, inputRegion)
    })

    // Process characters — match by index if ID doesn't match
    const rawChars = parsed.characters ?? []
    const characters = input.characters.map((inputChar, i) => {
      const raw = rawChars[i] ?? rawChars.find((r: any) => r.id === inputChar.id) ?? {}
      return validateAndFixCharOutput(raw, inputChar)
    })

    // Global variables
    const globalVariables: Record<string, number> = {}
    for (const [key, val] of Object.entries(parsed.global_variables ?? {})) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        globalVariables[key] = val
      }
    }

    return {
      organizations,
      regions,
      characters,
      global_variables: globalVariables,
    }
  } catch (err) {
    console.error('[world-builder] LLM generation failed:', err)

    // Fallback: generate minimal custom metrics for each org
    return generateFallback(input)
  }
}

function generateFallback(input: WorldBuilderInput): WorldBuilderOutput {
  const orgDefs: MetricDefinition[] = [
    { key: 'treasury', name: '国库', min: 0, max: 50000000, initial: 5000000, unit: '金币' },
    { key: 'food_supply', name: '粮食储备', min: 0, max: 100, initial: 60, unit: '%' },
    { key: 'public_order', name: '公共秩序', min: 0, max: 100, initial: 70, unit: '%' },
    { key: 'military_morale', name: '军心', min: 0, max: 100, initial: 65, unit: '%' },
    { key: 'trade_income', name: '贸易收入', min: 0, max: 5000000, initial: 500000, unit: '金币/年' },
    { key: 'corruption', name: '腐败程度', min: 0, max: 100, initial: 20, unit: '%' },
    { key: 'tech_level', name: '技术水平', min: 0, max: 100, initial: 30, unit: '' },
    { key: 'diplomatic_standing', name: '外交声望', min: 0, max: 100, initial: 50, unit: '' },
    { key: 'unrest', name: '民怨', min: 0, max: 100, initial: 15, unit: '%' },
    { key: 'infrastructure', name: '基础设施', min: 0, max: 100, initial: 40, unit: '%' },
  ]

  const orgFormulas: Record<string, string> = {
    treasury: 'treasury + trade_income * 0.1 - military_strength * 50 - corruption * 1000',
    food_supply: 'food_supply + infrastructure * 0.1 - population * 0.00001 - 0.5',
    public_order: 'public_order - unrest * 0.3 + cohesion * 0.1 - corruption * 0.2',
    military_morale: 'military_morale + cohesion * 0.05 - unrest * 0.1 - 1',
    trade_income: 'trade_income + economic_power * 500 - corruption * 2000',
    corruption: 'corruption + 0.5 - cohesion * 0.02',
    tech_level: 'tech_level + economic_power * 0.0005',
    diplomatic_standing: 'diplomatic_standing + public_reputation * 0.05 - 0.5',
    unrest: 'unrest + 0.3 - food_supply * 0.05 - public_order * 0.02',
    infrastructure: 'infrastructure + economic_power * 0.0003 - 0.2',
  }

  const orgs = input.organizations.map(org => ({
    id: org.id,
    custom_metrics: Object.fromEntries(orgDefs.map(d => [d.key, d.initial])),
    custom_metric_defs: orgDefs,
    custom_formulas: orgFormulas,
    scale: { population_base: 500000, economy_base: 5000000, military_base: 50000, description: '王国级' },
    population: 500000,
  }))

  const regionDefs: MetricDefinition[] = [
    { key: 'grain_output', name: '粮食产量', min: 0, max: 100, initial: 50, unit: '吨/年' },
    { key: 'minerals', name: '矿产', min: 0, max: 100, initial: 30, unit: '单位' },
    { key: 'public_order', name: '治安', min: 0, max: 100, initial: 60, unit: '%' },
    { key: 'cultural_flourishing', name: '文化繁荣', min: 0, max: 100, initial: 40, unit: '%' },
    { key: 'disease_level', name: '疾病程度', min: 0, max: 100, initial: 10, unit: '%' },
  ]

  const regionFormulas: Record<string, string> = {
    grain_output: 'grain_output + prosperity * 0.05 - danger_level * 0.1 - 0.5',
    minerals: 'minerals - 0.1',
    public_order: 'public_order - danger_level * 0.3 + prosperity * 0.02',
    cultural_flourishing: 'cultural_flourishing + prosperity * 0.03 - danger_level * 0.05',
    disease_level: 'disease_level - 0.5 + danger_level * 0.02',
  }

  const regions = input.regions.map(region => ({
    id: region.id,
    custom_metrics: Object.fromEntries(regionDefs.map(d => [d.key, d.initial])),
    custom_metric_defs: regionDefs,
    custom_formulas: regionFormulas,
  }))

  const charDefs: MetricDefinition[] = [
    { key: 'reputation', name: '声望', min: 0, max: 100, initial: 30, unit: '' },
    { key: 'skill_level', name: '技能水平', min: 0, max: 100, initial: 40, unit: '' },
    { key: 'network_strength', name: '人脉', min: 0, max: 100, initial: 25, unit: '' },
  ]

  const characters = input.characters.map(char => ({
    id: char.id,
    custom_metrics: Object.fromEntries(charDefs.map(d => [d.key, d.initial])),
    custom_metric_defs: charDefs,
  }))

  return {
    organizations: orgs,
    regions,
    characters,
    global_variables: { global_tension: 30, tech_level: 30, trade_volume: 10000 },
  }
}
