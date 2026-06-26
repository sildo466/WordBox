import { NextResponse } from 'next/server'
import { generateSingleAgent } from '@/services/llm/agent-gen'
import { createCharacterSpec } from '@/core/character'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const description = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!description) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const ctx = body.worldContext as Record<string, unknown> | undefined
  const contextLines: string[] = []
  if (ctx?.environment && typeof ctx.environment === 'object') {
    const env = ctx.environment as Record<string, unknown>
    if (typeof env.description === 'string') contextLines.push(`世界环境: ${env.description}`)
  }
  if (ctx?.social_context) {
    contextLines.push(`社会背景: ${JSON.stringify(ctx.social_context)}`)
  }
  if (typeof ctx?.narrative_seed === 'string') {
    contextLines.push(`核心叙事: ${ctx.narrative_seed}`)
  }

  const existing: { id: string; name: string; occupation?: string }[] = Array.isArray(body.existingAgents)
    ? body.existingAgents
    : []

  try {
    const spec = createCharacterSpec({ name: '自定义角色', description, story_role: 'background' })
    const agent = await generateSingleAgent({
      characterSpec: spec,
      worldContext: contextLines.join('\n'),
      existingAgents: existing,
      allFactionNames: [],
    })
    return NextResponse.json({ success: true, agent })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Agent generation failed: ${message}` }, { status: 500 })
  }
}
