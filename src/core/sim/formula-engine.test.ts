import { describe, expect, it } from 'vitest'
import { evaluateFormula, validateFormula, executeCustomFormulas } from './formula-engine'
import type { MetricDefinition } from './metric-schema'

describe('evaluateFormula', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateFormula('10 + 5', {})).toBe(15)
    expect(evaluateFormula('10 - 5', {})).toBe(5)
    expect(evaluateFormula('10 * 5', {})).toBe(50)
    expect(evaluateFormula('10 / 5', {})).toBe(2)
  })

  it('respects operator precedence', () => {
    expect(evaluateFormula('10 + 5 * 2', {})).toBe(20)
    expect(evaluateFormula('(10 + 5) * 2', {})).toBe(30)
    expect(evaluateFormula('2 * 3 + 4', {})).toBe(10)
  })

  it('substitutes variables', () => {
    expect(evaluateFormula('granary + trade_routes * 2', { granary: 60, trade_routes: 5 })).toBe(70)
    expect(evaluateFormula('a - b', { a: 100, b: 30 })).toBe(70)
  })

  it('treats missing variables as 0', () => {
    expect(evaluateFormula('x + 10', {})).toBe(10)
    expect(evaluateFormula('unknown_var * 2', {})).toBe(0)
  })

  it('handles division by zero', () => {
    expect(evaluateFormula('10 / 0', {})).toBe(0)
    expect(evaluateFormula('a / b', { a: 100, b: 0 })).toBe(0)
  })

  it('handles unary minus', () => {
    expect(evaluateFormula('-5 + 10', {})).toBe(5)
    expect(evaluateFormula('-a', { a: 30 })).toBe(-30)
  })

  it('clamps result to min/max', () => {
    expect(evaluateFormula('100 + 200', {}, 0, 200)).toBe(200)
    expect(evaluateFormula('10 - 20', {}, 0, 100)).toBe(0)
    expect(evaluateFormula('50', {}, 0, 100)).toBe(50)
  })

  it('returns 0 for NaN/Infinity', () => {
    // This shouldn't happen with our safe evaluator, but test the clamp
    expect(evaluateFormula('0 / 0', {}, 0, 100)).toBe(0)
  })

  it('evaluates complex world formula', () => {
    const values = { granary: 60, trade_routes: 5, military: 30, population: 500 }
    const result = evaluateFormula('granary + trade_routes * 2 - military * 0.3 - population * 0.01', values)
    // 60 + 10 - 9 - 5 = 56
    expect(result).toBeCloseTo(56, 5)
  })

  it('evaluates nested parentheses', () => {
    expect(evaluateFormula('((2 + 3) * (4 - 1))', {})).toBe(15)
  })

  it('handles decimal numbers', () => {
    expect(evaluateFormula('1.5 + 2.3', {})).toBeCloseTo(3.8, 5)
    expect(evaluateFormula('a * 0.5', { a: 100 })).toBeCloseTo(50, 5)
  })
})

describe('validateFormula', () => {
  it('accepts valid formulas', () => {
    const vars = ['granary', 'military', 'trade_routes']
    expect(validateFormula('granary + military * 2', vars).valid).toBe(true)
    expect(validateFormula('(a + b) / c', ['a', 'b', 'c']).valid).toBe(true)
    expect(validateFormula('10 + 20', vars).valid).toBe(true)
  })

  it('rejects empty formula', () => {
    expect(validateFormula('', ['a']).valid).toBe(false)
    expect(validateFormula('   ', ['a']).valid).toBe(false)
  })

  it('rejects dangerous characters', () => {
    expect(validateFormula('a; b', ['a', 'b']).valid).toBe(false)
    expect(validateFormula('a = b', ['a', 'b']).valid).toBe(false)
    expect(validateFormula('a > b', ['a', 'b']).valid).toBe(false)
    expect(validateFormula('a < b', ['a', 'b']).valid).toBe(false)
  })

  it('rejects function calls', () => {
    expect(validateFormula('alert("xss")', []).valid).toBe(false)
    expect(validateFormula('eval("1+1")', []).valid).toBe(false)
  })

  it('rejects formulas exceeding 500 chars', () => {
    const longFormula = 'a + '.repeat(200) + '1'
    expect(validateFormula(longFormula, ['a']).valid).toBe(false)
  })
})

describe('executeCustomFormulas', () => {
  const metrics: MetricDefinition[] = [
    { key: 'granary', name: '粮仓', min: 0, max: 100, initial: 60 },
    { key: 'unrest', name: '民怨', min: 0, max: 100, initial: 15 },
    { key: 'trade_routes', name: '贸易路线', min: 0, max: 20, initial: 5 },
  ]

  const formulas = {
    granary: 'granary + trade_routes * 2 - military * 0.3',
    unrest: 'unrest - granary * 0.05 + 1',
    trade_routes: 'trade_routes + allies * 0.5',
  }

  it('executes all formulas and returns new values', () => {
    const current = { granary: 60, unrest: 15, trade_routes: 5 }
    const external = { military: 30, allies: 3 }

    const result = executeCustomFormulas(metrics, formulas, current, external)

    // granary: 60 + 5*2 - 30*0.3 = 60 + 10 - 9 = 61
    expect(result.granary).toBeCloseTo(61, 5)
    // unrest: 15 - 60*0.05 + 1 = 15 - 3 + 1 = 13
    expect(result.unrest).toBeCloseTo(13, 5)
    // trade_routes: 5 + 3*0.5 = 6.5
    expect(result.trade_routes).toBeCloseTo(6.5, 5)
  })

  it('clamps values to metric min/max', () => {
    const current = { granary: 95, unrest: 5, trade_routes: 18 }
    const external = { military: 0, allies: 10 }

    const result = executeCustomFormulas(metrics, formulas, current, external)

    // granary: 95 + 18*2 - 0 = 131 → clamped to 100
    expect(result.granary).toBe(100)
    // trade_routes: 18 + 10*0.5 = 23 → clamped to 20
    expect(result.trade_routes).toBe(20)
  })

  it('preserves values for metrics without formulas', () => {
    const formulasNoUnrest = { granary: 'granary + 1' }
    const current = { granary: 50, unrest: 20, trade_routes: 10 }

    const result = executeCustomFormulas(metrics, formulasNoUnrest, current)

    expect(result.granary).toBe(51)
    expect(result.unrest).toBe(20) // unchanged
    expect(result.trade_routes).toBe(10) // unchanged
  })
})
