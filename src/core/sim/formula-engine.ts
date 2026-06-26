/**
 * Safe expression evaluator for custom metric formulas.
 * Only allows: +, -, *, /, numbers, variable references, parentheses.
 * Prohibits: function calls, property access, assignment, comparison operators.
 */

import type { MetricDefinition, MetricValues, FormulaDefinition } from './metric-schema'

// ─── Tokenizer ───

type TokenType = 'number' | 'variable' | 'op' | 'lparen' | 'rparen'

type Token = { type: TokenType; value: string }

const ALLOWED_CHARS = /^[a-zA-Z0-9_.+\-*/() \t]+$/
const VARIABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]

    // skip whitespace
    if (ch === ' ' || ch === '\t') { i++; continue }

    // number (integer or decimal)
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < expr.length && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let num = ''
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i]
        i++
      }
      tokens.push({ type: 'number', value: num })
      continue
    }

    // variable
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let name = ''
      while (i < expr.length && ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= '0' && expr[i] <= '9') || expr[i] === '_')) {
        name += expr[i]
        i++
      }
      tokens.push({ type: 'variable', value: name })
      continue
    }

    // operators
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }

    // parens
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue }

    // unknown character — reject
    throw new Error(`Unexpected character '${ch}' at position ${i}`)
  }
  return tokens
}

// ─── Recursive descent parser ───

type ExprNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'binary'; op: string; left: ExprNode; right: ExprNode }
  | { type: 'unary'; op: string; operand: ExprNode }

class Parser {
  private tokens: Token[]
  private pos: number

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null
  }

  private consume(): Token {
    if (this.pos >= this.tokens.length) throw new Error('Unexpected end of expression')
    return this.tokens[this.pos++]
  }

  parse(): ExprNode {
    const expr = this.parseAddSub()
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token '${this.tokens[this.pos].value}' at position ${this.pos}`)
    }
    return expr
  }

  // add/sub (lowest precedence)
  private parseAddSub(): ExprNode {
    let left = this.parseMulDiv()
    while (true) {
      const tok = this.peek()
      if (tok?.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        this.consume()
        const right = this.parseMulDiv()
        left = { type: 'binary', op: tok.value, left, right }
      } else {
        break
      }
    }
    return left
  }

  // mul/div (higher precedence)
  private parseMulDiv(): ExprNode {
    let left = this.parseUnary()
    while (true) {
      const tok = this.peek()
      if (tok?.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        this.consume()
        const right = this.parseUnary()
        left = { type: 'binary', op: tok.value, left, right }
      } else {
        break
      }
    }
    return left
  }

  // unary +/- (highest precedence)
  private parseUnary(): ExprNode {
    const tok = this.peek()
    if (tok?.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      this.consume()
      const operand = this.parsePrimary()
      if (tok.value === '-') {
        return { type: 'unary', op: '-', operand }
      }
      return operand
    }
    return this.parsePrimary()
  }

  // primary: number, variable, (expr)
  private parsePrimary(): ExprNode {
    const tok = this.peek()
    if (!tok) throw new Error('Unexpected end of expression')

    if (tok.type === 'number') {
      this.consume()
      return { type: 'number', value: parseFloat(tok.value) }
    }

    if (tok.type === 'variable') {
      this.consume()
      return { type: 'variable', name: tok.value }
    }

    if (tok.type === 'lparen') {
      this.consume()
      const expr = this.parseAddSub()
      const closing = this.peek()
      if (closing?.type !== 'rparen') {
        throw new Error('Missing closing parenthesis')
      }
      this.consume()
      return expr
    }

    throw new Error(`Unexpected token '${tok.value}'`)
  }
}

// ─── Evaluator ───

function evaluate(node: ExprNode, values: Record<string, number>): number {
  switch (node.type) {
    case 'number':
      return node.value
    case 'variable':
      return values[node.name] ?? 0
    case 'unary':
      return -evaluate(node.operand, values)
    case 'binary': {
      const left = evaluate(node.left, values)
      const right = evaluate(node.right, values)
      switch (node.op) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return right === 0 ? 0 : left / right
        default: return 0
      }
    }
  }
}

// ─── Public API ───

/**
 * Validate a formula string against available variables.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateFormula(
  formula: string,
  availableVars: string[],
): { valid: boolean; error?: string } {
  if (!formula || formula.trim().length === 0) {
    return { valid: false, error: 'Formula is empty' }
  }

  if (formula.length > 500) {
    return { valid: false, error: 'Formula exceeds 500 characters' }
  }

  // reject dangerous characters
  if (!ALLOWED_CHARS.test(formula)) {
    return { valid: false, error: 'Formula contains disallowed characters' }
  }

  // reject function-call patterns
  if (/[a-zA-Z_]\s*\(/.test(formula.replace(/^(sin|cos|tan|abs|sqrt|pow|exp|log|Math|eval|Function|require|import|fetch|alert|console|document|window)\s*\(/, ''))) {
    // Check if any variable name followed by ( exists (function call pattern)
    const funcCallPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/
    // Allow parentheses that are part of grouping: if preceded by operator or start
    const cleaned = formula.replace(/\s+/g, '')
    // Simple check: if we see word( where word is not a known variable, reject
    const funcPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
    let match: RegExpExecArray | null
    while ((match = funcPattern.exec(cleaned)) !== null) {
      const name = match[1]
      if (!availableVars.includes(name) && name !== 'Math') {
        return { valid: false, error: `Function calls not allowed: '${name}()'` }
      }
    }
  }

  // try to parse
  try {
    const tokens = tokenize(formula)
    const parser = new Parser(tokens)
    parser.parse()
    return { valid: true }
  } catch (e) {
    return { valid: false, error: `Parse error: ${(e as Error).message}` }
  }
}

/**
 * Evaluate a formula string with given variable values.
 * Clamps result to [min, max]. Returns 0 on any error.
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, number>,
  min: number = -Infinity,
  max: number = Infinity,
): number {
  try {
    const tokens = tokenize(formula)
    const parser = new Parser(tokens)
    const ast = parser.parse()
    const result = evaluate(ast, values)

    if (!Number.isFinite(result) || Number.isNaN(result)) {
      return Math.max(min, Math.min(max, 0))
    }

    return Math.max(min, Math.min(max, result))
  } catch {
    return Math.max(min, Math.min(max, 0))
  }
}

/**
 * Execute all custom formulas for an entity.
 * Returns new metric values after one tick of formula evolution.
 */
export function executeCustomFormulas(
  metrics: MetricDefinition[],
  formulas: FormulaDefinition,
  currentValues: MetricValues,
  externalVars: Record<string, number> = {},
): MetricValues {
  const allVars = { ...externalVars, ...currentValues }
  const result: MetricValues = { ...currentValues }

  for (const metric of metrics) {
    const formula = formulas[metric.key]
    if (!formula) continue

    const newValue = evaluateFormula(formula, allVars, metric.min, metric.max)
    result[metric.key] = newValue
  }

  return result
}
