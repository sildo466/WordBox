/**
 * Utilities for repairing and validating LLM JSON outputs.
 * Handles common issues: markdown code blocks, trailing commas, single quotes, etc.
 */

/**
 * Attempt to extract and repair JSON from an LLM response string.
 * Handles: markdown fences, trailing commas, single quotes, comments, BOM.
 */
export function repairJSON(raw: string): string {
  let text = raw.trim()

  // Remove BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  // Remove thinking tags (DeepSeek, etc.)
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Extract from markdown code fences (primary)
  const fenceMatch = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  } else if (text.startsWith('```')) {
    // Fallback: strip opening ```json and closing ``` even if regex fails
    // (handles edge cases like invisible chars or unusual whitespace)
    text = text.replace(/^```(?:json|JSON)?[\s\r\n]*/, '').replace(/[\s\r\n]*```[\s\S]*$/, '').trim()
  }

  // Remove single-line comments (// ...)
  text = text.replace(/\/\/.*$/gm, '')

  // Remove multi-line comments (/* ... */)
  text = text.replace(/\/\*[\s\S]*?\*\//g, '')

  // Replace single quotes with double quotes (naive but often works)
  // Only if no double quotes in string already
  if (!text.includes('"')) {
    text = text.replace(/'/g, '"')
  }

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([\]}])/g, '$1')

  // Remove leading comma (sometimes LLM starts array with comma)
  text = text.replace(/^\s*,/, '')

  return text
}

/**
 * Parse JSON from LLM output with repair attempts.
 * Throws if all attempts fail.
 */
export function parseLLMJSON<T = any>(raw: string): T {
  const repaired = repairJSON(raw)

  try {
    return JSON.parse(repaired) as T
  } catch (firstError) {
    // Try finding the first { or [ and last } or ]
    const startObj = repaired.indexOf('{')
    const startArr = repaired.indexOf('[')
    const start = startObj >= 0 && (startArr < 0 || startObj < startArr) ? startObj : startArr

    const endObj = repaired.lastIndexOf('}')
    const endArr = repaired.lastIndexOf(']')
    const end = Math.max(endObj, endArr)

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(repaired.slice(start, end + 1)) as T
      } catch (secondError) {
        // Last resort: try to fix common issues
        const fixed = repaired
          .slice(start, end + 1)
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys

        try {
          return JSON.parse(fixed) as T
        } catch (thirdError) {
          console.error('[json-repair] Failed to parse. Raw (first 500 chars):', raw.slice(0, 500))
          console.error('[json-repair] Repaired (first 500 chars):', repaired.slice(0, 500))
          throw new Error(`Failed to parse LLM JSON after repair: ${firstError}`)
        }
      }
    }

    throw new Error(`Failed to parse LLM JSON: ${firstError}`)
  }
}

/**
 * Validate that a parsed object has all required fields.
 * Returns the object if valid, throws if not.
 */
export function validateFields<T>(
  obj: Record<string, any>,
  requiredFields: string[],
  typeName: string = 'object',
): T {
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      throw new Error(`${typeName} missing required field: ${field}`)
    }
  }
  return obj as T
}
