/**
 * Custom metric schema types for LLM-driven world simulation.
 * Each organization/character/region can define its own metrics and formulas.
 */

/** Single custom metric definition */
export type MetricDefinition = {
  key: string
  name: string
  min: number
  max: number
  initial: number
  unit?: string
}

/** Formula map: metric_key -> formula expression string */
export type FormulaDefinition = Record<string, string>

/** Scale definition — lets LLM set numerical magnitude per world */
export type ScaleDefinition = {
  population_base?: number
  economy_base?: number
  military_base?: number
  description?: string
}

/** Full custom data system for an entity */
export type CustomDataSystem = {
  metrics: MetricDefinition[]
  formulas: FormulaDefinition
  scale?: ScaleDefinition
}

/** Runtime metric values stored on entity */
export type MetricValues = Record<string, number>

/** Formula change record for audit trail */
export type FormulaChange = {
  tick: number
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  metric_key: string
  old_formula: string
  new_formula: string
  reason: string
}

/** Data Agent output — concrete numerical changes */
export type DataChange = {
  entity_id: string
  entity_type: 'organization' | 'character' | 'region'
  metric_key: string
  delta: number
  reason: string
}

/** Minimum number of custom metrics per entity (LLM prompt constraint) */
export const MIN_CUSTOM_METRICS = 10

/** Maximum formula length in characters */
export const MAX_FORMULA_LENGTH = 500

/** Maximum single-tick delta as percentage of metric range */
export const MAX_DELTA_PERCENT = 0.1
