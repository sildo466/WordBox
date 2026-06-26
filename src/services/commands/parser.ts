import { createLLMClient, getModel, callLLM } from '@/services/llm/client'
import type { GodCommand } from '@/core/sim/command'

export async function parseCommand(
  raw: string,
  context: { worldPremise: string; entities: string[] },
): Promise<Partial<GodCommand>> {
  const client = createLLMClient()
  const prompt = `解析以下神命令，提取目标和意图。
世界前提：${context.worldPremise}
已知实体：${context.entities.join('、')}

神命令：${raw}

输出JSON格式：{
  "parsed_intent": "简洁的意图描述",
  "target_type": "character|organization|region|world",
  "target_name": "目标名称",
  "strength": "suggestion|order|divine_decree",
  "constraints": []
}`

  try {
    const response = await callLLM(client, {
      model: getModel(),
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return {}
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}
