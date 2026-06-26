import type { WorldSnapshot } from '@/core/world'
import type { TickPatch } from '@/core/director'
import { createLLMClient, getModel, callLLM } from './client'

/** LLM 返回的导演决策 */
type DirectorDecision = {
  scene: 'world_event' | 'environment_shift' | 'social_change'
  headline: string
  description: string
  impact: {
    environment_delta?: string
    pressure_added?: string
    narrative_shift?: string
    involved_characters?: string[]
  }
  significant: boolean
}

/**
 * 世界导演 — 分析世界状态，生成推动叙事的事件
 */
export async function generateDirectorEvent(world: WorldSnapshot): Promise<TickPatch> {
  const client = createLLMClient()
  const model = getModel()

  const origin = world.events.find(e => e.type === 'world_born' || e.type === 'world_created')
  const originData = origin?.payload as Record<string, unknown> | undefined

  const recentEvents = world.events
    .slice(-10)
    .filter(e => e.type !== 'tick' && e.type !== 'world_born' && e.type !== 'world_created')
    .map(e => (e.payload as Record<string, unknown>)?.summary || e.type)

  const roster = world.agents.npcs.map(npc => ({
    name: npc.name,
    goals: npc.goals,
    mood: npc.emotion.label,
  }))

  const prompt = `你是世界的观察者与推动者。观察当前局势，创造一个推动故事发展的事件。

## 世界核心
${originData?.theme || originData?.narrative_seed || world.environment.description}

## 当前时刻
- 第 ${world.tick} 个周期
- 环境：${world.environment.description.slice(0, 200)}
- 矛盾焦点：${world.social_context.pressures.join('、') || '暂无'}
- 当前叙事：${world.social_context.narratives.join('、') || '暂无'}

## 活跃角色
${roster.map(c => `- ${c.name}（情绪: ${c.mood}，目标: ${c.goals.join('、')}）`).join('\n') || '暂无'}

## 最近发生的事件
${recentEvents.join('\n') || '暂无'}

## 约束
1. 事件必须与世界核心主题呼应
2. 大约每 5-10 个周期产生一次重大事件，其余为细微变化
3. 使用与世界描述相同的语言

返回 JSON：
{
  "scene": "world_event | environment_shift | social_change",
  "headline": "事件标题",
  "description": "事件描述",
  "impact": {
    "environment_delta": "环境变化（可选）",
    "pressure_added": "新增压力（可选）",
    "narrative_shift": "叙事变化（可选）",
    "involved_characters": ["角色名"]
  },
  "significant": true 或 false
}`

  try {
    const responseText = await callLLM(client, {
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return emptyPatch('导演本轮无事件')

    const decision: DirectorDecision = JSON.parse(jsonMatch[0])

    return {
      timeDelta: decision.significant ? 1 : 0,
      events: [{
        id: `evt-${world.tick}-${Date.now()}`,
        kind: decision.significant ? 'macro' : 'micro',
        summary: `${decision.headline}：${decision.description}`,
        conflict: decision.scene === 'world_event',
      }],
      rulesDelta: [],
      notes: [
        decision.impact.environment_delta,
        decision.impact.pressure_added,
        decision.impact.narrative_shift,
      ].filter((n): n is string => Boolean(n)),
      meta: { director_decision: decision },
    }
  } catch (err) {
    console.error('[Director] 生成失败:', err)
    return emptyPatch('导演生成失败')
  }
}

/**
 * 将导演决策的效果应用到世界状态
 */
export function applyDirectorEffects(world: WorldSnapshot, patch: TickPatch): WorldSnapshot {
  const decision = patch.meta?.director_decision as DirectorDecision | undefined
  if (!decision?.impact) return world

  const { environment_delta, pressure_added, narrative_shift } = decision.impact
  let result = world

  if (environment_delta) {
    const lang = world.config?.language || 'zh'
    const tag = lang === 'zh' ? '\n\n【新变化】' : lang === 'ja' ? '\n\n【変化】' : '\n\n[Update]'
    result = {
      ...result,
      environment: {
        description: result.environment.description + tag + environment_delta,
      },
    }
  }

  if (pressure_added) {
    result = {
      ...result,
      social_context: {
        ...result.social_context,
        pressures: [...result.social_context.pressures, pressure_added],
      },
    }
  }

  if (narrative_shift) {
    result = {
      ...result,
      social_context: {
        ...result.social_context,
        narratives: [...result.social_context.narratives, narrative_shift],
      },
    }
  }

  return result
}

function emptyPatch(note: string): TickPatch {
  return { timeDelta: 0, events: [], rulesDelta: [], notes: [note], meta: {} }
}
