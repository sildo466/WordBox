import type { SimAgent } from '@/core/world'
import type { CharacterSpec } from '@/core/character'
import { createCharacter } from '@/core/director'
import { createLLMClient, getModel, callLLM } from './client'

/** LLM 返回的角色蓝图 — 20 属性版 */
type CharacterBlueprint = {
  id: string
  name: string
  // 性格参数
  personality_params: {
    stability: number
    agency: number
    empathy: number
    attachment: number
    openness: number
  }
  // 身体属性
  vitality: number
  health: number
  energy: number
  stress: number
  aging: number
  // 精神属性
  morale: number
  focus: number
  sanity: number
  // 社会属性
  influence: number
  reputation: number
  standing: number
  loyalty: number
  // 资源属性
  wealth: number
  army: number
  retainers: number
  secrets: number
  // 能力属性
  martial: number
  cunning: number
  charisma: number
  lore: number
  // 欲望
  desires?: Array<{ type: string; description: string; intensity: number }>
  // 其他
  history?: string
  goals?: string[]
  occupation?: string
  voice?: string
  approach?: string
  expertise?: string[]
  philosophy?: string
  location?: string
}

/** LLM 返回的关系描述 */
type BondSpec = {
  source: string
  target: string
  strength: number
  description: string
}

/**
 * 从用户定义的 CharacterSpec 批量创建角色
 */
export async function createAgentsFromCharacterSpecs(
  characterSpecs: CharacterSpec[],
  worldContext: string,
  allFactionNames: string[]
): Promise<SimAgent[]> {
  if (characterSpecs.length === 0) return []

  const agents: SimAgent[] = []
  const existing: { id: string; name: string; occupation?: string }[] = []

  for (const spec of characterSpecs) {
    try {
      const agent = await generateSingleAgent({
        characterSpec: spec,
        worldContext,
        existingAgents: existing,
        allFactionNames,
      })
      agents.push(agent)
      existing.push({
        id: agent.id,
        name: agent.name,
        occupation: agent.occupation,
      })
      console.log(`  ✓ Created: ${agent.name}`)
    } catch (e) {
      console.warn(`Failed to create character "${spec.name}":`, (e as Error).message)
    }
  }

  return agents
}

/**
 * 生成填充角色（背景人物）
 */
export async function generateFillerAgents(
  options: {
    count: number
    worldContext: string
    existingCharacters: { name: string; id: string; occupation?: string }[]
    existingFactions: string[]
    language: string
  }
): Promise<SimAgent[]> {
  const { count, worldContext, existingCharacters, existingFactions, language } = options

  if (count <= 0) return []

  const CHUNK_SIZE = 10
  const allAgents: SimAgent[] = []
  const allBonds: BondSpec[] = []

  const chunks = Math.ceil(count / CHUNK_SIZE)
  let remaining = count

  for (let chunk = 0; chunk < chunks; chunk++) {
    const chunkCount = Math.min(CHUNK_SIZE, remaining)
    const currentExisting = allAgents.map(a =>
      `${a.name} (${a.occupation || 'unknown'}, id: ${a.id})`
    ).join(', ')
    const allExisting = [...existingCharacters, ...allAgents.map(a => ({
      name: a.name, id: a.id, occupation: a.occupation
    }))]
    const existingNames = allExisting.map(a => a.name).join(', ')

    console.log(`  Filler chunk ${chunk + 1}/${chunks}: generating ${chunkCount} agents...`)

    const { blueprints, bonds } = await generateFillerChunk({
      count: chunkCount,
      worldContext,
      existingCharacters: currentExisting || existingCharacters.map(c => `${c.name} (${c.occupation || 'unknown'}, id: ${c.id})`).join(', '),
      existingNames,
      existingFactions,
      language,
    })

    const agents = blueprints.map((bp) => {
      const agent = createCharacter(bp.id)
      return {
        ...agent,
        name: bp.name || bp.id,
        // personality_params (0-100) → traits (0-1)
        traits: {
          openness: bp.personality_params.openness / 100,
          stability: bp.personality_params.stability / 100,
          attachment: bp.personality_params.attachment / 100,
          agency: bp.personality_params.agency / 100,
          empathy: bp.personality_params.empathy / 100,
        },
        // raw values (0-100/1000) → condition (0-1)
        condition: {
          energy: bp.energy / 100,
          stress: bp.stress / 100,
          sleep_debt: 0.1,
          focus: bp.focus / 100,
          aging_index: bp.aging / 1000,
        },
        goals: bp.goals || [],
        occupation: bp.occupation,
        voice: bp.voice,
        approach: bp.approach,
        expertise: bp.expertise,
        philosophy: bp.philosophy,
        location: bp.location || 'unknown',
        success_metrics: { wealth: 0, reputation: 0, power: 0, knowledge: 0 },
        // 保留 LLM 生成的数值属性，供 math engine 使用
        _sim_attrs: {
          vitality: bp.vitality, health: bp.health, energy: bp.energy,
          stress: bp.stress, aging: bp.aging,
          morale: bp.morale, focus: bp.focus, sanity: bp.sanity,
          influence: bp.influence, reputation: bp.reputation,
          standing: bp.standing, loyalty: bp.loyalty,
          wealth: bp.wealth, army: bp.army,
          retainers: bp.retainers, secrets: bp.secrets,
          martial: bp.martial, cunning: bp.cunning,
          charisma: bp.charisma, lore: bp.lore,
          personality_params: bp.personality_params,
          desires: bp.desires,
        },
      }
    })

    allAgents.push(...agents)
    allBonds.push(...bonds)
    remaining -= chunkCount
  }

  // 写入关系
  for (const bond of allBonds) {
    const fromAgent = allAgents.find(a => a.id === bond.source || a.name === bond.source)
    if (fromAgent) {
      // target 可能是 ID 也可能是名字
      let targetId = bond.target
      const toAgent = allAgents.find(a => a.id === targetId || a.name === targetId)
      if (toAgent) targetId = toAgent.id

      fromAgent.relations[targetId] = Math.max(-1, Math.min(1, bond.strength))
      if (toAgent) {
        fromAgent.short_term.push({
          id: `bond-${fromAgent.id}-${targetId}`,
          content: `与${toAgent.name}的关系：${bond.description}`,
          importance: 0.65,
          emotional_weight: Math.abs(bond.strength) * 0.4,
          source: 'self' as const,
          timestamp: new Date().toISOString(),
          decay_rate: 0.025,
          retrieval_strength: 0.85,
        })
      }
    }
  }

  return allAgents
}

/**
 * 从 CharacterSpec 生成单个角色
 * CharacterSpec 是权威来源 — LLM 只补充用户未指定的细节
 */
export async function generateSingleAgent(options: {
  characterSpec: CharacterSpec
  worldContext: string
  existingAgents: { id: string; name: string; occupation?: string }[]
  allFactionNames: string[]
}): Promise<SimAgent> {
  const { characterSpec: spec, worldContext, existingAgents, allFactionNames } = options
  const client = createLLMClient()
  const model = getModel()

  const existingList = existingAgents.length > 0
    ? existingAgents.map(a => `- ${a.name}（${a.occupation || '未知'}，id: ${a.id}）`).join('\n')
    : '（无）'

  const relHint = existingAgents.length >= 2
    ? `新角色必须与至少 2 个已有角色建立关系。`
    : existingAgents.length === 1
      ? `新角色必须与已有角色建立关系。`
      : ``

  const userRels = Object.keys(spec.relationships || {}).length > 0
    ? `\n**用户指定的关系（权威）：**\n${Object.entries(spec.relationships || {}).map(([t, d]) => `- ${t}：${d}`).join('\n')}\n这些关系必须体现在 relations 数组中。`
    : ''

  const factionLine = spec.faction_allegiance
    ? `\n**所属阵营：** ${spec.faction_allegiance}${allFactionNames.length > 0 ? `（已知阵营：${allFactionNames.join('、')}）` : ''}`
    : ''

  const prompt = `你是世界模拟器的角色塑造师。用户已经定义了一个角色的骨架，你需要赋予其血肉。

**世界背景：**
${worldContext}

**已有角色：**
${existingList}${factionLine}

**用户定义的角色（不可更改姓名、阵营、信念）：**
- 姓名：${spec.name}
- 定位：${spec.story_role || '未指定'}
- 描述：${spec.description || '（无）'}
- 初始位置：${spec.initial_location || '（未指定）'}${userRels}

${relHint}

## 数值属性设定指南

你需要为角色设定 20 个数值属性。属性分为两类：

### 有上限属性（0-100）
vitality（生命力）、health（健康）、energy（体力）、stress（压力）、morale（士气）、focus（集中力）、sanity（理智）、loyalty（忠诚）

### 无上限属性（0-∞，按刻度参考设定）
影响力(influence)、声望(reputation)、地位(standing)、财富(wealth)、兵力(army)、追随者(retainers)、秘密(secrets)、武力(martial)、谋略(cunning)、魅力(charisma)、学识(lore)、衰老(aging)

**刻度参考（无上限属性）：**
- 普通平民：1-5
- 士兵/工匠：10-30
- 骑士/商人：30-100
- 领主/将军：100-500
- 国王/教皇：500-5000
- 传奇英雄：5000-50000
- 半神/远古存在：50000-100000

### 性格参数（0-100）
stability（情绪稳定性）、agency（主动性）、empathy（共情力）、attachment（社交需求）、openness（开放性）

**请根据角色身份合理设定所有数值。举例：**
- 一个普通农民：martial=5, wealth=3, army=0, influence=1
- 一个久经沙场的将军：martial=300, stress=60, health=50, aging=60
- 一个富甲一方的商人：wealth=2000, charisma=150, cunning=80, army=10
- 一个千年帝王：influence=8000, martial=5000, lore=3000, aging=80

请生成以下字段：
1. id：内部标识符（kebab-case）
2. 姓名：必须是 "${spec.name}"
3. personality_params：stability, agency, empathy, attachment, openness（0-100）
4. 身体属性：vitality, health, energy, stress, aging
5. 精神属性：morale, focus, sanity
6. 社会属性：influence, reputation, standing, loyalty
7. 资源属性：wealth, army, retainers, secrets
8. 能力属性：martial, cunning, charisma, lore
9. desires：2-3 个欲望，每个有 type(power/wealth/safety/revenge/knowledge/love/freedom/duty/other)、description、intensity(0-1)
10. 背景故事（history）
11. 目标（goals）：2-3 个，至少一个涉及其他角色
12. 职业（occupation）
13. 说话风格（voice）
14. 处事方式（approach）
15. 专长（expertise）：${spec.expertise?.join('、') || '根据描述推断'}
16. 核心信念（philosophy）：${spec.core_beliefs?.join('；') || '一句话'}
17. 位置（location）：${spec.initial_location || '选择一个'}

返回 JSON：
{
  "character": {
    "id": "kebab-case", "name": "${spec.name}",
    "personality_params": { "stability": 50, "agency": 50, "empathy": 50, "attachment": 50, "openness": 50 },
    "vitality": 80, "health": 80, "energy": 70, "stress": 20, "aging": 20,
    "morale": 55, "focus": 60, "sanity": 80,
    "influence": 1, "reputation": 1, "standing": 1, "loyalty": 50,
    "wealth": 1, "army": 0, "retainers": 0, "secrets": 0,
    "martial": 1, "cunning": 1, "charisma": 1, "lore": 1,
    "desires": [
      { "type": "power", "description": "渴望掌控命运", "intensity": 0.6 },
      { "type": "safety", "description": "保护所爱之人", "intensity": 0.4 }
    ],
    "history": "...", "goals": ["目标1", "目标2"],
    "occupation": "...", "voice": "...", "approach": "...",
    "expertise": ["技能1", "技能2"], "philosophy": "...", "location": "..."
  },
  "bonds": [
    { "source": "新角色id", "target": "已有角色id", "strength": 0.5, "description": "关系说明" }
  ]
}`

  const responseText = await callLLM(client, {
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!responseText) throw new Error('LLM 返回为空')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('无法解析 LLM 返回的 JSON')

  const parsed = JSON.parse(jsonMatch[0])
  const bp: CharacterBlueprint = parsed.character
  const bonds: BondSpec[] = parsed.bonds || []

  if (!bp?.id || !bp?.name) throw new Error('LLM 返回的角色蓝图缺少 id 或 name')

  // 使用 spec.id 和 spec.name — LLM 可能忽略指令生成自己的 ID/名字
  const agentId = spec.id
  const agentName = spec.name
  const llmId = bp.id // 保留 LLM 的 ID，用于映射 bond 源

  const base = createCharacter(agentId)
  const agent: SimAgent = {
    ...base,
    name: agentName,
    // personality_params (0-100) → traits (0-1)
    traits: bp.personality_params ? {
      openness: (bp.personality_params.openness ?? 50) / 100,
      stability: (bp.personality_params.stability ?? 50) / 100,
      attachment: (bp.personality_params.attachment ?? 50) / 100,
      agency: (bp.personality_params.agency ?? 50) / 100,
      empathy: (bp.personality_params.empathy ?? 50) / 100,
    } : base.traits,
    // raw values (0-100/1000) → condition (0-1)
    condition: {
      energy: (bp.energy ?? 70) / 100,
      stress: (bp.stress ?? 20) / 100,
      sleep_debt: 0.1,
      focus: (bp.focus ?? 60) / 100,
      aging_index: (bp.aging ?? 20) / 1000,
    },
    goals: bp.goals || [],
    occupation: bp.occupation,
    voice: bp.voice,
    approach: bp.approach,
    expertise: bp.expertise,
    philosophy: bp.philosophy,
    location: bp.location || 'unknown',
    success_metrics: { wealth: 0, reputation: 0, power: 0, knowledge: 0 },
    // 保留 LLM 生成的数值属性，供 math engine 使用
    _sim_attrs: {
      vitality: bp.vitality, health: bp.health, energy: bp.energy,
      stress: bp.stress, aging: bp.aging,
      morale: bp.morale, focus: bp.focus, sanity: bp.sanity,
      influence: bp.influence, reputation: bp.reputation,
      standing: bp.standing, loyalty: bp.loyalty,
      wealth: bp.wealth, army: bp.army,
      retainers: bp.retainers, secrets: bp.secrets,
      martial: bp.martial, cunning: bp.cunning,
      charisma: bp.charisma, lore: bp.lore,
      personality_params: bp.personality_params,
      desires: bp.desires,
    },
  } as SimAgent & { _sim_attrs: Record<string, any> }

  // 写入关系 — bond.source 可能是 spec.id 或 llmId（LLM 自己生成的 ID）
  for (const bond of bonds) {
    if (bond.source === agent.id || bond.source === llmId) {
      // bond.target 可能是已有 agent 的 spec ID，也可能是 LLM 自己生成的 ID
      let targetId = bond.target
      // 尝试通过名字匹配来修正 target ID
      const existing = existingAgents.find(a => a.id === targetId || a.name === targetId)
      if (existing) targetId = existing.id

      agent.relations[targetId] = Math.max(-1, Math.min(1, bond.strength))
      const targetName = existingAgents.find(a => a.id === targetId)?.name || targetId
      agent.short_term.push({
        id: `bond-${agent.id}-${targetId}`,
        content: `与${targetName}的关系：${bond.description}`,
        importance: 0.65,
        emotional_weight: Math.abs(bond.strength) * 0.4,
        source: 'self' as const,
        timestamp: new Date().toISOString(),
        decay_rate: 0.025,
        retrieval_strength: 0.85,
      })
    }
  }

  return agent
}

/**
 * 生成一批填充角色
 */
export async function generateFillerChunk(options: {
  count: number
  worldContext: string
  existingCharacters: string
  existingNames: string
  existingFactions: string[]
  language: string
}): Promise<{ blueprints: CharacterBlueprint[]; bonds: BondSpec[] }> {
  const { count, worldContext, existingCharacters, existingNames, existingFactions, language } = options
  const client = createLLMClient()
  const model = getModel()

  const factionsLine = existingFactions.length > 0
    ? `\n已知阵营：${existingFactions.join('、')}`
    : ''

  const prompt = `你是世界模拟器的角色塑造师。为这个世界生成 ${count} 个背景角色。

**世界背景：** ${worldContext}${factionsLine}

**已有角色（不可重复）：** ${existingNames || '（无）'}

**已有角色详情：**
${existingCharacters || '（无）'}

每个新角色需要：
1. id：唯一标识（kebab-case）
2. 姓名：符合世界设定
3. personality_params：stability, agency, empathy, attachment, openness（0-100）
4. 身体属性：vitality(0-100), health(0-100), energy(0-100), stress(0-100), aging(0-∞)
5. 精神属性：morale(0-100), focus(0-100), sanity(0-100)
6. 社会属性：influence(0-∞), reputation(0-∞), standing(0-∞), loyalty(0-100)
7. 资源属性：wealth(0-∞), army(0-∞), retainers(0-∞), secrets(0-∞)
8. 能力属性：martial(0-∞), cunning(0-∞), charisma(0-∞), lore(0-∞)
9. desires：2-3 个欲望
10. 背景故事（history）：必须提及至少一个已有角色或阵营
11. 目标（goals）：2-3 个，至少一个涉及已有角色
12. 职业（occupation）
13. 说话风格（voice）
14. 处事方式（approach）
15. 专长（expertise）：2-4 项
16. 核心信念（philosophy）：一句话
17. 位置（location）

**数值刻度参考（无上限属性）：**
- 普通平民：1-5
- 士兵/工匠：10-30
- 骑士/商人：30-100
- 领主/将军：100-500

关系要求：
- 每个新角色至少与 2 个角色（已有或新建）建立关系
- 关系必须双向
- 强度范围 -1 到 1

语言：所有内容必须使用 ${language}

返回 JSON：
{
  "characters": [
    {
      "id": "...", "name": "...",
      "personality_params": { "stability": 50, "agency": 50, "empathy": 50, "attachment": 50, "openness": 50 },
      "vitality": 80, "health": 80, "energy": 70, "stress": 20, "aging": 20,
      "morale": 55, "focus": 60, "sanity": 80,
      "influence": 1, "reputation": 1, "standing": 1, "loyalty": 50,
      "wealth": 1, "army": 0, "retainers": 0, "secrets": 0,
      "martial": 1, "cunning": 1, "charisma": 1, "lore": 1,
      "desires": [...],
      "history": "...", "goals": [...], "occupation": "...", "voice": "...", "approach": "...",
      "expertise": [...], "philosophy": "...", "location": "..."
    }
  ],
  "bonds": [
    { "source": "id-a", "target": "id-b", "strength": 0.3, "description": "关系说明" }
  ]
}`

  const responseText = await callLLM(client, {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!responseText) throw new Error('LLM 返回为空')

  // 提取 JSON
  let jsonText = ''
  const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1]
  } else {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('无法解析 LLM 返回的 JSON')
    jsonText = jsonMatch[0]
  }

  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    const fixed = jsonText
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
    parsed = JSON.parse(fixed)
  }

  const blueprints: CharacterBlueprint[] = parsed.characters || []
  const bonds: BondSpec[] = parsed.bonds || []

  return { blueprints, bonds }
}

// Deprecated
export async function generatePersonalAgents(_options: any): Promise<SimAgent[]> {
  console.warn('[agent-gen] generatePersonalAgents 已废弃，请使用 createAgentsFromCharacterSpecs + generateFillerAgents')
  return []
}

// Deprecated
export async function extractUserDefinedCharacters(
  _worldPrompt: string,
  _worldContext: string
): Promise<{ description: string; name: string }[]> {
  console.warn('[agent-gen] extractUserDefinedCharacters 已废弃，请使用 world-gen.ts 的 parseWorldEntities')
  return []
}
