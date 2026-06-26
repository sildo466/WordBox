import { NextResponse } from 'next/server'
import { createLLMClient, getModel, callLLM } from '@/services/llm/client'
import { createGodCommand } from '@/core/sim/command'
import type { GodCommand } from '@/core/sim/command'
import { runSimulationTick } from '@/core/sim/tick'
import { appendCommand } from '@/services/commands/service'
import type { WorldSnapshot, WorldState } from '@/core/world'
import { loadWorldSnapshot, saveWorldSnapshot } from '@/services/persistence'

type CommandRouteBody = {
  world?: WorldSnapshot | WorldState
  raw_input?: string
}

function generateId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function parseCommand(raw: string, context: { worldPremise: string; entities: string[] }): Promise<Partial<GodCommand>> {
  const client = createLLMClient()
  const prompt = `你是一个世界模拟引擎的命令解析器。解析以下神命令，提取目标、意图，并制定多阶段叙事计划。

世界前提：${context.worldPremise}
已知实体：${context.entities.join('、')}

神命令：${raw}

你需要：
1. 解析命令意图和目标
2. 制定 3-5 个叙事阶段，每个阶段描述该阶段应该发生什么具体事件。这些阶段将用于在后续 tick 中持续推进故事，确保命令的影响是持续的、有具体表现的。

例如"让人类制造生物武器攻打精灵族"的叙事计划可能是：
- 阶段1：人类秘密组建生化研究团队，在地下实验室开始研发
- 阶段2：取得初步突破，成功培育出第一代病原体
- 阶段3：进行武器化改造和战场测试，引发小规模恐慌
- 阶段4：生物武器部署准备完成，精灵族收到风声开始备战
- 阶段5：发动攻击，生物武器在战场上展现毁灭性效果

输出JSON格式：
{
  "parsed_intent": "简洁的意图描述",
  "target_type": "character|organization|region|world",
  "target_name": "目标名称",
  "strength": "suggestion|order|divine_decree",
  "constraints": [],
  "narrative_plan": ["阶段1描述", "阶段2描述", "阶段3描述", ...]
}`

  try {
    const res = await callLLM(client, {
      model: getModel(),
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const match = res.match(/\{[\s\S]*\}/)
    if (!match) return {}
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as CommandRouteBody
    const snapshot = await loadWorldSnapshot(params.id)
    const world = snapshot?.world_snapshot ?? snapshot?.world_state ?? body.world
    const raw_input = body.raw_input

    if (!world || !raw_input?.trim()) {
      return NextResponse.json({ error: 'world and raw_input are required' }, { status: 400 })
    }

    const w = world as any
    const tick = w.tick ?? w.time?.tick ?? 0
    const id = generateId()
    const cmd = createGodCommand(id, raw_input.trim(), tick)

    const entityNames = [
      ...(w.characters ?? []).map((c: any) => typeof c === 'string' ? c : c.name),
      ...(w.factions ?? []).map((f: any) => typeof f === 'string' ? f : f.name),
      ...(w.regions ?? []).map((r: any) => typeof r === 'string' ? r : r.name),
    ]

    const parsed = await parseCommand(raw_input, {
      worldPremise: w.environment?.geography ?? w.premise ?? w.config?.description ?? '',
      entities: entityNames,
    })

    Object.assign(cmd, parsed)
    cmd.status = 'parsed'

    const worldWithCommand = appendCommand(world as any, cmd) as any

    const tickResult = await runSimulationTick({
      world: worldWithCommand,
      pendingCommands: [cmd],
    })
    const saved = await saveWorldSnapshot(params.id, tickResult.world)

    return NextResponse.json({
      command: cmd,
      world: saved.world_snapshot,
      world_state: saved.world_state,
      new_events: tickResult.new_events,
      resolved_commands: tickResult.resolved_commands,
      tick_narrative: tickResult.tick_narrative,
      new_world_mood: tickResult.new_world_mood,
    })
  } catch (error) {
    console.error('Failed to process command:', error)
    return NextResponse.json({ error: 'Failed to process command: ' + (error as Error).message }, { status: 500 })
  }
}
