/**
 * LLM-based conversation scene generator.
 * Given an event context, generates a dialogue scene between participants.
 */

import { createLLMClient, getModel, callLLM } from './client'
import type { ConversationScene } from '@/core/sim/conversation'
import { createConversationScene } from '@/core/sim/conversation'

type ConversationInput = {
  eventTitle: string
  eventSummary: string
  eventDetail: string
  eventType: string
  participants: Array<{ id: string; name: string; personality?: string; role?: string }>
  location?: string
  language: string
  tick: number
}

/**
 * Generate a conversation scene from an event context.
 */
export async function generateConversation(input: ConversationInput): Promise<ConversationScene> {
  const participantDesc = input.participants
    .map(p => `- ${p.name}（${p.personality || '未知性格'}，${p.role || '参与者'}）`)
    .join('\n')

  const prompt = `你是一个对话场景生成器。根据以下事件，生成一段角色之间的对话。

事件：${input.eventTitle}
类型：${input.eventType}
摘要：${input.eventSummary}
详情：${input.eventDetail}
${input.location ? `地点：${input.location}` : ''}

参与者：
${participantDesc}

要求：
1. 生成 4-8 条对话行
2. 每条对话应该符合角色性格
3. 对话应该自然、有张力、推动情节
4. 最后附上对话的后果/影响

请用以下 JSON 格式返回：
{
  "lines": [
    { "speaker_id": "角色ID", "text": "对话内容", "emotion": "情感", "role": "speaker" }
  ],
  "consequences": [
    { "description": "后果描述", "impact_type": "relation|state|event" }
  ],
  "tone": "对话基调"
}

语言：${input.language === 'zh' ? '中文' : 'English'}`

  try {
    const client = createLLMClient()
    const raw = await callLLM(client, {
      model: getModel(),
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const result = JSON.parse(jsonMatch[0]) as {
      lines: Array<{ speaker_id: string; text: string; emotion?: string; role?: string }>
      consequences?: Array<{ description: string; impact_type?: string }>
      tone?: string
    }

    const scene = createConversationScene(
      `conv_${input.tick}_${Date.now()}`,
      input.eventTitle,
      input.tick,
    )

    scene.participants = input.participants.map(p => ({
      id: `part_${p.id}`,
      name: p.name,
      role: 'speaker' as const,
      character_id: p.id,
      organization_id: null,
      mood: '',
      stance: '',
    }))

    scene.lines = (result.lines ?? []).map((line, i) => ({
      id: `line_${i}`,
      speaker_id: line.speaker_id,
      speaker_name: input.participants.find(p => p.id === line.speaker_id)?.name ?? '',
      text: line.text,
      tone: line.emotion ?? '',
      tick: input.tick,
    }))

    scene.consequences = (result.consequences ?? []).map((c, i) => ({
      id: `cons_${i}`,
      type: (c.impact_type as 'relationship' | 'task' | 'event' | 'world_state' | 'belief' | 'other') ?? 'other',
      summary: c.description,
      target_ids: [],
    }))

    scene.premise = result.tone ?? 'neutral'
    scene.location_region_id = input.location ?? null

    return scene
  } catch (err) {
    console.error('[conversation-generator] LLM generation failed:', err)
    // Return a minimal fallback scene
    const scene = createConversationScene(
      `conv_${input.tick}_${Date.now()}`,
      input.eventTitle,
      input.tick,
    )
    scene.participants = input.participants.map(p => ({
      id: `part_${p.id}`,
      name: p.name,
      role: 'speaker' as const,
      character_id: p.id,
      organization_id: null,
      mood: '',
      stance: '',
    }))
    scene.lines = [{
      id: 'line_0',
      speaker_id: input.participants[0]?.id ?? null,
      speaker_name: input.participants[0]?.name ?? '旁白',
      text: `（${input.eventTitle}后，众人沉默不语。）`,
      tone: 'tense',
      tick: input.tick,
    }]
    scene.premise = 'tense'
    scene.location_region_id = input.location ?? null
    return scene
  }
}
