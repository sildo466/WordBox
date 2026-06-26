/**
 * LLM 客户端适配层
 * 使用 OpenAI SDK 调用 OpenAI 兼容 API
 */
import OpenAI from 'openai'

let clientInstance: OpenAI | null = null

export function createLLMClient() {
  if (clientInstance) return clientInstance as any

  const apiKey = process.env.WORDBOX_API_KEY || ''
  const baseURL = process.env.WORDBOX_API_BASE || 'https://api.openai.com/v1'

  clientInstance = new OpenAI({
    apiKey,
    baseURL,
  })
  return clientInstance as any
}

export function getModel() {
  return process.env.WORDBOX_MODEL || 'deepseek-v4-flash'
}

/**
 * 调用 LLM 并返回完整文本响应
 * 默认 30 秒超时，防止 API 卡死导致 tick 无限阻塞
 */
export async function callLLM(
  client: any,
  params: { model: string; max_tokens: number; messages: Array<{ role: string; content: string }> },
  timeoutMs: number = 30_000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await client.chat.completions.create({
      model: params.model,
      max_tokens: params.max_tokens,
      messages: params.messages,
      signal: controller.signal,
    })
    return response.choices?.[0]?.message?.content || ''
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'aborted') {
      throw new Error(`LLM call timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
