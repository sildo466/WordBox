import { NextResponse } from 'next/server'
import { generateWorldFromPrompt } from '@/services/llm/world-gen'
import {
  createAgentsFromCharacterSpecs,
  generateFillerAgents,
} from '@/services/llm/agent-gen'
import { generateWorldBuilderData } from '@/services/llm/world-builder'
import { createLLMClient, getModel, callLLM } from '@/services/llm/client'
import type { WorldSnapshot } from '@/core/world'
import { snapshotToWorldState } from '@/core/world'
import { saveWorldSnapshot } from '@/services/persistence'

/**
 * World initialization: extract entities from prompt, generate world,
 * create agents, wire factions/storylines, generate prologue.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const worldPrompt = typeof body.worldPrompt === 'string' ? body.worldPrompt.trim() : ''
  if (!worldPrompt) {
    return NextResponse.json({ error: 'worldPrompt is required' }, { status: 400 })
  }
  const worldId = typeof body.worldId === 'string' ? body.worldId : undefined

  try {
    console.log('[init] Starting world generation pipeline...')

    // Step 1: Two-step world generation
    const {
      world,
      extractedCharacters,
      extractedFactions,
      suggestedCharacters,
      suggestedFactions,
      suggestedStorylines,
      suppressExtraCharacters,
      language,
    } = await generateWorldFromPrompt({ worldPrompt })

    if (worldId) {
      world.world_id = worldId
    }

    // Step 1.5: Generate custom metrics and formulas for all entities
    console.log('1.5. Generating custom metrics and formulas...')
    try {
      // Try LLM-based World Builder first
      const worldBuilderInput = {
        worldPremise: worldPrompt,
        language,
        organizations: (world.factions ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.category ?? 'other',
          description: f.description ?? '',
          ideology: f.ideology ?? '',
        })),
        regions: ((world as any).regions ?? []).map((r: any) => ({
          id: r.id ?? r.name,
          name: r.name ?? r.id,
          terrain: r.terrain ?? 'plains',
          description: r.description ?? '',
        })),
        characters: extractedCharacters.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description ?? '',
          organization_id: c.faction_id ?? null,
        })),
      }

      const builderOutput = await generateWorldBuilderData(worldBuilderInput)

      // Apply to factions (which are the canonical org store at this point)
      const factions = world.factions ?? []
      for (let i = 0; i < factions.length; i++) {
        const faction = factions[i] as any
        const orgData = builderOutput.organizations[i]
        if (orgData && orgData.custom_metric_defs?.length > 0) {
          faction.custom_metrics = orgData.custom_metrics
          faction.custom_metric_defs = orgData.custom_metric_defs
          faction.custom_formulas = orgData.custom_formulas
          faction.scale = orgData.scale
          faction.population = orgData.population
          // Scale standard fields
          if (orgData.scale?.military_base) {
            faction.military_strength = Math.round(orgData.scale.military_base * (0.3 + Math.random() * 0.4))
          }
          if (orgData.scale?.economy_base) {
            faction.economic_power = Math.round(orgData.scale.economy_base * 0.01 * (0.5 + Math.random() * 0.5))
          }
          console.log(`  ✓ ${faction.name}: ${orgData.custom_metric_defs.length} metrics, pop=${orgData.population}, mil=${faction.military_strength}`)
        }
      }

      // Apply to regions
      const regions = (world as any).regions ?? []
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i]
        const regionData = builderOutput.regions[i]
        if (regionData && regionData.custom_metric_defs?.length > 0) {
          region.custom_metrics = regionData.custom_metrics
          region.custom_metric_defs = regionData.custom_metric_defs
          region.custom_formulas = regionData.custom_formulas
        }
      }

      // Store global variables
      ;(world as any)._global_variables = builderOutput.global_variables

      // Store character custom metrics for later application
      ;(world as any)._pending_char_metrics = builderOutput.characters

      console.log(`  ✓ Custom metrics: ${builderOutput.organizations.filter(o => o.custom_metric_defs?.length > 0).length}/${factions.length} orgs enriched`)
    } catch (e) {
      console.warn('World Builder failed, applying default metrics:', (e as Error).message)
      // Apply default metrics directly to factions
      applyDefaultMetrics(world)
    }

    console.log(`2. Creating agents: ${extractedCharacters.length} user-defined characters...`)

    // Merge all factions (user-extracted + LLM-suggested)
    const allFactions = [...extractedFactions, ...suggestedFactions]
    const allFactionNames = allFactions.map(f => f.name)

    // Step 2: Create agents from user-defined character specs (no limit)
    const worldContext = `${world.environment.description}\n\nSocial context: ${JSON.stringify(world.social_context)}`

    let totalAgents = 0
    try {
      world.agents.npcs = await createAgentsFromCharacterSpecs(
        extractedCharacters,
        worldContext,
        allFactionNames
      )
      totalAgents = world.agents.npcs.length
      console.log(`  ✓ Created ${totalAgents} user-defined agents`)
    } catch (e) {
      console.error('Failed to create user-defined agents:', (e as Error).message)
      world.agents.npcs = []
    }

    // Step 3: Optionally generate filler agents
    if (!suppressExtraCharacters && suggestedCharacters.length > 0) {
      const existingForFiller = world.agents.npcs.map(a => ({
        name: a.name,
        id: a.id,
        occupation: a.occupation,
      }))

      const existingNames = existingForFiller.map(e => e.name)

      // Only add suggested characters that don't duplicate existing ones
      const uniqueSuggested = suggestedCharacters.filter(
        s => !existingNames.some(
          n => n.toLowerCase() === s.name.toLowerCase()
        )
      )

      if (uniqueSuggested.length > 0) {
        console.log(`3. Generating ${uniqueSuggested.length} filler/background agents...`)

        try {
          const fillerAgents = await generateFillerAgents({
            count: uniqueSuggested.length,
            worldContext,
            existingCharacters: existingForFiller,
            existingFactions: allFactionNames,
            language,
          })

          world.agents.npcs = [...world.agents.npcs, ...fillerAgents]
          totalAgents = world.agents.npcs.length
          console.log(`  ✓ Added ${fillerAgents.length} filler agents (total: ${totalAgents})`)
        } catch (e) {
          console.warn('Filler agent generation failed, continuing:', (e as Error).message)
        }
      } else {
        console.log('3. No unique filler characters to add (all duplicates of user-defined)')
      }
    } else if (suppressExtraCharacters) {
      console.log('3. User suppressed extra characters — skipping filler agents')
    }

    // Step 3.5: Apply character custom metrics to agents
    const pendingCharMetrics = (world as any)._pending_char_metrics
    if (Array.isArray(pendingCharMetrics)) {
      for (const charData of pendingCharMetrics) {
        // Find matching agent by id or name
        const agent = world.agents.npcs.find(
          (a: any) => a.id === charData.id || a.name === extractedCharacters.find(c => c.id === charData.id)?.name,
        )
        if (agent) {
          ;(agent as any).custom_metrics = charData.custom_metrics
          ;(agent as any).custom_metric_defs = charData.custom_metric_defs
        }
      }
      delete (world as any)._pending_char_metrics
    }

    // Step 4: Populate world with factions and storyline presets
    world.factions = allFactions

    // Step 4.5: Re-apply custom metrics to final factions (Step 1.5 wrote to old factions array)
    applyDefaultMetrics(world)
    world.storyline_presets = suggestedStorylines

    // Populate world.characters with all character specs (user-defined + suggested)
    world.characters = [...extractedCharacters, ...suggestedCharacters.filter(
      s => !extractedCharacters.some(e => e.name.toLowerCase() === s.name.toLowerCase())
    )]

    // 将 LLM blueprint 数值属性写入 world.characters，供 math engine 使用
    for (const char of world.characters as any[]) {
      const agent = world.agents.npcs.find((a: any) => a.id === char.id || a.name === char.name) as any
      if (agent?._sim_attrs) {
        const attrs = agent._sim_attrs
        // 写入所有数值属性
        for (const key of Object.keys(attrs)) {
          if (key === 'personality_params' || key === 'desires') {
            char[key] = attrs[key]
          } else if (attrs[key] !== undefined && attrs[key] !== null) {
            char[key] = attrs[key]
          }
        }
        // 写入 organization_id（从 agent 的阵营信息推断）
        if (!char.organization_id && agent.location) {
          const matchingFaction = allFactions.find((f: any) =>
            f.name === agent.location || f.id === agent.location
          )
          if (matchingFaction) char.organization_id = matchingFaction.id
        }
        delete agent._sim_attrs
      }

      // 将 agent 的关系转换为 character 的 CharacterRelation[] 格式
      if (agent?.relations && Object.keys(agent.relations).length > 0) {
        if (!Array.isArray(char.relations) || char.relations.length === 0) {
          char.relations = Object.entries(agent.relations).map(([targetId, affinity]: [string, any]) => {
            const strength = Math.abs(affinity as number)
            const type = (affinity as number) > 0.3 ? 'friend' :
                         (affinity as number) < -0.3 ? 'enemy' :
                         (affinity as number) > 0.1 ? 'ally' : 'neutral'
            return {
              character_id: targetId,
              type,
              strength: Math.min(1, strength),
              notes: '',
            }
          })
        }
      }
    }

    // Step 5: Record initialization event
    const agentNameList = world.agents.npcs.map(a => a.name)
    world.events.push({
      id: `init-complete-${Date.now()}`,
      type: 'world_initialized',
      timestamp: new Date().toISOString(),
      payload: {
        agent_count: totalAgents,
        agent_names: agentNameList,
        user_defined_count: extractedCharacters.length,
        faction_count: allFactions.length,
        storyline_count: suggestedStorylines.length,
        initialization_type: 'user_first',
      },
    })

    // Step 6: Generate opening narration
    console.log('4. Generating opening narration...')
    try {
      const prologue = await generatePrologue(world)
      world.tick_summary = prologue
      console.log('  ✓ Prologue generated')
    } catch (e) {
      console.warn('Prologue generation failed, skipping:', (e as Error).message)
    }

    console.log('=== World initialization complete ===')
    console.log(`  Agents: ${totalAgents} (${extractedCharacters.length} user-defined)`)

    const effectiveWorldId = world.world_id
    const syncedWorldState = snapshotToWorldState(world)
    await saveWorldSnapshot(effectiveWorldId, world)

    return NextResponse.json({
      success: true,
      world,
      world_state: syncedWorldState,
      summary: {
        agents_count: totalAgents,
        agent_names: agentNameList,
        user_defined_count: extractedCharacters.length,
        faction_count: allFactions.length,
        storyline_count: suggestedStorylines.length,
        initialization_type: 'user_first',
        message: suppressExtraCharacters
          ? 'World created with user-specified characters only.'
          : 'World created with user characters and supporting cast.',
      },
    })
  } catch (error) {
    console.error('Failed to initialize world:', error)
    return NextResponse.json(
      { error: 'Failed to initialize world: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * Generate a prologue narration introducing the world and its characters.
 */
async function generatePrologue(world: WorldSnapshot): Promise<string> {
  const client = createLLMClient()
  const model = getModel()

  const agents = world.agents.npcs
  const castEntries = agents.map((a: any) => {
    const allies = Object.entries(a.relations || {})
      .filter(([, v]) => (v as number) > 0.3)
      .slice(0, 2)
      .map(([id]) => agents.find((t: any) => t.id === id)?.name)
      .filter(Boolean)
    const rivals = Object.entries(a.relations || {})
      .filter(([, v]) => (v as number) < -0.3)
      .slice(0, 2)
      .map(([id]) => agents.find((t: any) => t.id === id)?.name)
      .filter(Boolean)
    const parts = [`${a.name} — ${a.occupation || '身份不明'}`]
    if (a.philosophy) parts.push(`信条: ${a.philosophy}`)
    if (allies.length) parts.push(`盟友: ${allies.join('、')}`)
    if (rivals.length) parts.push(`对手: ${rivals.join('、')}`)
    return parts.join(' | ')
  }).join('\n')

  const lang = world.config?.language || 'zh'

  const prompt = `你是一位世界叙事者。这个世界的帷幕刚刚拉开，一切尚未发生，但暗流涌动。

【世界】
${world.environment.description}

【势力格局】
${world.social_context.pressures?.join('；') || '暂无明显冲突'}

【登场人物】
${castEntries}

请为这个世界撰写一段开场独白（300-500字），要求：
- 用感官细节描绘世界的面貌（视觉、听觉、嗅觉）
- 简要引出每位关键人物的身份与处境
- 暗示即将爆发的矛盾与潜在的同盟
- 以悬念收尾，让读者期待下一幕
- 语言: ${lang}

直接输出独白文本，不要 JSON。`

  return await callLLM(client, {
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })
}

/**
 * Apply default custom metrics to all factions when World Builder LLM fails.
 * Bypasses LLM entirely — uses hardcoded defaults with realistic scales.
 */
function applyDefaultMetrics(world: WorldSnapshot) {
  const orgDefs = [
    { key: 'treasury', name: '国库', min: 0, max: 50000000, initial: 5000000, unit: '金币' },
    { key: 'food_supply', name: '粮食储备', min: 0, max: 100, initial: 60, unit: '%' },
    { key: 'public_order', name: '公共秩序', min: 0, max: 100, initial: 70, unit: '%' },
    { key: 'military_morale', name: '军心', min: 0, max: 100, initial: 65, unit: '%' },
    { key: 'trade_income', name: '贸易收入', min: 0, max: 5000000, initial: 500000, unit: '金币/年' },
    { key: 'corruption', name: '腐败程度', min: 0, max: 100, initial: 20, unit: '%' },
    { key: 'tech_level', name: '技术水平', min: 0, max: 100, initial: 30, unit: '' },
    { key: 'diplomatic_standing', name: '外交声望', min: 0, max: 100, initial: 50, unit: '' },
    { key: 'unrest', name: '民怨', min: 0, max: 100, initial: 15, unit: '%' },
    { key: 'infrastructure', name: '基础设施', min: 0, max: 100, initial: 40, unit: '%' },
  ]
  const orgFormulas = {
    treasury: 'treasury + trade_income * 0.1 - military_strength * 50 - corruption * 1000',
    food_supply: 'food_supply + infrastructure * 0.1 - population * 0.00001 - 0.5',
    public_order: 'public_order - unrest * 0.3 + cohesion * 0.1 - corruption * 0.2',
    military_morale: 'military_morale + cohesion * 0.05 - unrest * 0.1 - 1',
    trade_income: 'trade_income + economic_power * 500 - corruption * 2000',
    corruption: 'corruption + 0.5 - cohesion * 0.02',
    tech_level: 'tech_level + economic_power * 0.0005',
    diplomatic_standing: 'diplomatic_standing + public_reputation * 0.05 - 0.5',
    unrest: 'unrest + 0.3 - food_supply * 0.05 - public_order * 0.02',
    infrastructure: 'infrastructure + economic_power * 0.0003 - 0.2',
  }

  const regionDefs = [
    { key: 'grain_output', name: '粮食产量', min: 0, max: 100, initial: 50, unit: '吨/年' },
    { key: 'minerals', name: '矿产', min: 0, max: 100, initial: 30, unit: '单位' },
    { key: 'public_order', name: '治安', min: 0, max: 100, initial: 60, unit: '%' },
    { key: 'cultural_flourishing', name: '文化繁荣', min: 0, max: 100, initial: 40, unit: '%' },
    { key: 'disease_level', name: '疾病程度', min: 0, max: 100, initial: 10, unit: '%' },
  ]
  const regionFormulas = {
    grain_output: 'grain_output + prosperity * 0.05 - danger_level * 0.1 - 0.5',
    minerals: 'minerals - 0.1',
    public_order: 'public_order - danger_level * 0.3 + prosperity * 0.02',
    cultural_flourishing: 'cultural_flourishing + prosperity * 0.03 - danger_level * 0.05',
    disease_level: 'disease_level - 0.5 + danger_level * 0.02',
  }

  const popMap: Record<string, number> = {
    empire: 2000000, kingdom: 500000, republic: 300000, tribe: 5000,
    guild: 500, church: 10000, merchant_company: 2000, criminal_syndicate: 500,
    secret_society: 200, mercenary_band: 1000, other: 10000,
  }
  const milMap: Record<string, number> = {
    empire: 200000, kingdom: 50000, republic: 30000, tribe: 2000,
    guild: 100, church: 5000, merchant_company: 500, criminal_syndicate: 300,
    secret_society: 50, mercenary_band: 2000, other: 1000,
  }
  const ecoMap: Record<string, number> = {
    empire: 50000000, kingdom: 10000000, republic: 8000000, tribe: 500000,
    guild: 200000, church: 3000000, merchant_company: 5000000, criminal_syndicate: 1000000,
    secret_society: 500000, mercenary_band: 800000, other: 1000000,
  }

  for (const faction of (world.factions ?? [])) {
    const f = faction as any
    const type = f.category ?? 'other'
    f.custom_metric_defs = orgDefs
    f.custom_metrics = Object.fromEntries(orgDefs.map(d => [d.key, d.initial]))
    f.custom_formulas = orgFormulas
    f.population = popMap[type] ?? 10000
    f.scale = { population_base: f.population, economy_base: ecoMap[type] ?? 1000000, military_base: milMap[type] ?? 1000 }
    f.military_strength = Math.round((milMap[type] ?? 1000) * (0.3 + Math.random() * 0.4))
    f.economic_power = Math.round((ecoMap[type] ?? 1000000) * 0.01 * (0.5 + Math.random() * 0.5))
    console.log(`  ✓ ${f.name} (default): 10 metrics, pop=${f.population}, mil=${f.military_strength}`)
  }

  for (const region of ((world as any).regions ?? [])) {
    region.custom_metric_defs = regionDefs
    region.custom_metrics = Object.fromEntries(regionDefs.map(d => [d.key, d.initial]))
    region.custom_formulas = regionFormulas
  }

  ;(world as any)._global_variables = { global_tension: 30, tech_level: 30, trade_volume: 10000 }
}
