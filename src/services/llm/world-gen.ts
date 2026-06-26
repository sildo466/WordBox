import {
  snapshotToWorldState,
} from '@/core/world'
import type { WorldSnapshot, WorldState, WorldAtmosphere } from '@/core/world'
import type { CharacterSpec } from '@/core/character'
import type { Faction } from '@/core/faction'
import type { StorylinePreset } from '@/core/storyline'
import { createEmptySnapshot } from '@/core/world'
import { createCharacterSpec } from '@/core/character'
import { createFaction } from '@/core/faction'
import { createStorylinePreset } from '@/core/storyline'
import { createLLMClient, getModel, callLLM } from './client'

export type ExtractedLocation = {
  name: string
  description?: string
  terrain?: string
  danger_level?: number
  prosperity?: number
  population?: string
  notable_locations?: string[]
}

export type ExtractionResult = {
  characters: CharacterSpec[]
  factions: Faction[]
  locations: ExtractedLocation[]
  storyline_hints: string[]
  suppress_extra_characters: boolean
  language: string
}

/**
 * Step 1: 从用户自由文本中提取结构化实体
 */
export async function parseWorldEntities(
  worldPrompt: string
): Promise<ExtractionResult> {
  const client = createLLMClient()
  const model = getModel()

  const prompt = `你是世界构建解析器。用户描述了一个虚构世界，你需要提取所有明确提到的实体。

用户描述：
"""
${worldPrompt}
"""

规则：
1. 提取所有有名字的角色 — 主角、反派、配角、历史人物
2. 提取所有阵营/组织/国家/教派/门派
3. 提取所有地点 — 城市、区域、地下城、大陆
4. 提取故事线索 — 冲突、预言、历史恩怨
5. 如果用户明确表示不需要额外角色，设 suppress_extra_characters 为 true
6. 用户描述是权威的 — 不要重命名或重新解读
7. 角色包含性格、背景、职业、关系等用户提到的一切
8. 阵营包含立场、目标、成员名（如有提到）
9. 检测用户输入语言，设 language 字段（如 "zh"、"en"、"ja"）
10. 用户描述的角色定位（主角、反派等）写入 story_role
11. persona 和 vitals 仅在用户明确给出数值时填写
12. 用户描述的角色间关系写入 relationships（"对方名: 关系描述"）

返回 JSON：
{
  "characters": [
    {
      "name": "用户原文中的角色名",
      "description": "用户对该角色的完整描述",
      "story_role": "protagonist" | "antagonist" | "deuteragonist" | "supporting" | "mentor" | "love_interest" | "foil" | "sidekick" | "neutral" | "background",
      "faction_allegiance": "阵营名或 null",
      "initial_location": "起始位置或 null",
      "relationships": { "对方名": "关系描述" },
      "expertise": ["技能"],
      "core_beliefs": ["信念"],
      "initial_goals": ["目标"],
      "vitals_hint": { "energy": 0-1, "stress": 0-1 } | null,
      "personality_hint": { "openness": 0-1, "stability": 0-1, "attachment": 0-1, "agency": 0-1, "empathy": 0-1 } | null
    }
  ],
  "factions": [
    {
      "name": "用户原文中的阵营名",
      "description": "阵营描述",
      "alignment": "benevolent" | "neutral" | "selfish" | "hostile" | "chaotic",
      "category": "government" | "military" | "religious" | "commercial" | "secret_society" | "cultural" | "rebel" | "academic" | "criminal" | "tribal" | "other",
      "influence_level": "global" | "regional" | "local" | "fringe" | "declining",
      "core_values": ["价值观"],
      "public_perception": -1 到 1
    }
  ],
  "locations": [
    {
      "name": "用户原文中的地名",
      "description": "地理、文化、氛围描述",
      "terrain": "plains|forest|mountain|desert|coast|urban|swamp|tundra|volcanic",
      "danger_level": 0.0 到 1.0,
      "prosperity": 0.0 到 1.0,
      "population": "few|moderate|many|dense|sparse 或数字",
      "notable_locations": ["子地点或地标"]
    }
  ],
  "storyline_hints": ["X与Y之间的冲突", "关于Z的预言"],
  "suppress_extra_characters": false,
  "language": "zh" | "en"
}`

  const responseText = await callLLM(client, {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!responseText) throw new Error('LLM 未返回响应')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('无法解析 LLM 返回的 JSON')

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    const fixed = jsonMatch[0]
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
    parsed = JSON.parse(fixed)
  }

  const characters: CharacterSpec[] = (parsed.characters || []).map((c: any) =>
    createCharacterSpec({
      name: c.name || 'Unknown',
      description: c.description || '',
      story_role: c.story_role || 'background',
      faction_allegiance: c.faction_allegiance || undefined,
      initial_location: c.initial_location || undefined,
      relationships: c.relationships || {},
      expertise: c.expertise || [],
      core_beliefs: c.core_beliefs || [],
      initial_goals: c.initial_goals || [],
      initial_vitals: c.vitals_hint || undefined,
      persona: c.personality_hint || undefined,
    })
  )

  const factions: Faction[] = (parsed.factions || []).map((f: any) =>
    createFaction({
      name: f.name || 'Unknown Faction',
      description: f.description || '',
      alignment: f.alignment || 'neutral',
      category: f.category || 'other',
      influence: (f.influence_level as any) || 'local',
      core_values: f.core_values || [],
      public_perception: f.public_perception ?? 0,
    })
  )

  const language: string = parsed.language || 'en'

  const rawLocations = parsed.locations || []
  const locations: ExtractedLocation[] = rawLocations.map((loc: any) => {
    if (typeof loc === 'string') return { name: loc }
    return {
      name: loc.name || 'Unknown',
      description: loc.description || '',
      terrain: loc.terrain || 'plains',
      danger_level: typeof loc.danger_level === 'number' ? loc.danger_level : 0.2,
      prosperity: typeof loc.prosperity === 'number' ? loc.prosperity : 0.5,
      population: loc.population || 'moderate',
      notable_locations: loc.notable_locations || [],
    }
  })

  return {
    characters,
    factions,
    locations,
    storyline_hints: parsed.storyline_hints || [],
    suppress_extra_characters: parsed.suppress_extra_characters || false,
    language,
  }
}

/**
 * Step 2: 围绕已提取实体生成完整世界
 */
async function generateWorldAroundExtraction(
  worldPrompt: string,
  extraction: ExtractionResult
): Promise<{ world: WorldSnapshot; world_state: WorldState; suggestedCharacters: CharacterSpec[]; suggestedFactions: Faction[]; suggestedStorylines: StorylinePreset[] }> {
  const client = createLLMClient()
  const model = getModel()

  const charBlock = extraction.characters.map(c =>
    `- ${c.name}（${c.story_role || '未定'}）${c.description ? '：' + c.description : ''}${c.faction_allegiance ? ` [阵营: ${c.faction_allegiance}]` : ''}`
  ).join('\n')

  const factionBlock = extraction.factions.map(f =>
    `- ${f.name}：${f.history || ''} [${f.alignment}, ${f.category}]`
  ).join('\n')

  const locBlock = extraction.locations.map(l => `- ${l.name}`).join('\n')

  const hintBlock = extraction.storyline_hints.map(s => `- ${s}`).join('\n')

  const suppressLine = extraction.suppress_extra_characters
    ? '\n**重要：用户不想要任何额外角色。不要建议任何新角色。**'
    : '\n你可以建议 2-5 个额外的背景角色来充实世界。标记 origin: "llm_filled"。'

  const prompt = `你是世界构建师。用户描述了一个世界，我已经提取了其中的实体。你的任务是围绕这些实体生成完整的世界。

**用户原始描述：**
"""
${worldPrompt}
"""

**已提取角色（权威，不可改名或删除）：**
${charBlock}

**已提取阵营（权威，不可改名或删除）：**
${factionBlock}

**已提取地点：**
${locBlock}

**故事线索：**
${hintBlock}

**检测到的语言：** ${extraction.language}${suppressLine}

返回 JSON：
{
  "title": "世界的简短标题（3-8 字）",
  "summary": "一两句话概括这个世界的核心冲突或氛围",
  "setting": {
    "overview": "整体环境描述 — 生动详细，融入用户提到的地点",
    "region": "地理区域",
    "climate": "气候特征",
    "terrain": "地形特征"
  },
  "atmosphere": {
    "history": ["重大历史事件"],
    "current_narratives": ["主流叙事"],
    "tensions": ["社会压力"],
    "power_structures": ["主要权力机构"],
    "ambiance": ["氛围基调"]
  },
  "starting_point": "世界的起始时刻描述",
  "core_theme": "一句话概括这个世界的核心主题",
  "extra_characters": [
    {
      "name": "姓名",
      "description": "简述 — 在世界中的角色、性格",
      "story_role": "supporting" | "background",
      "faction_allegiance": null 或 "阵营名",
      "expertise": ["技能"]
    }
  ],
  "extra_factions": [
    {
      "name": "名称",
      "description": "描述",
      "alignment": "neutral",
      "category": "other",
      "influence_level": "local",
      "core_values": [],
      "public_perception": 0
    }
  ],
  "storylines": [
    {
      "title": "主线标题",
      "description": "内容",
      "trigger_description": "何时触发",
      "volume_count": 3
    }
  ]
}

要求：
1. 所有内容使用检测到的语言（${extraction.language}）
2. 已提取角色和阵营是绝对权威 — 自然地融入环境和社会背景
3. 用户提到的地点必须在环境中描述
4. 根据用户描述的冲突和线索建议 1-3 个故事线预设
5. 各部分之间不能有矛盾`

  const responseText = await callLLM(client, {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!responseText) throw new Error('LLM 未返回响应')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('无法解析 LLM 返回的 JSON')

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    const fixed = jsonMatch[0]
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
    parsed = JSON.parse(fixed)
  }

  const world = createEmptySnapshot()
  world.title = parsed.title || undefined
  world.summary = parsed.summary || undefined

  const lang = extraction.language
  world.config = {
    language: lang,
    reborn_suffix: lang === 'zh' ? '·转世' : lang === 'ja' ? '·転生' : ' Reborn',
    past_life_prefix: lang === 'zh' ? '前世记忆：' : lang === 'ja' ? '前世記憶：' : 'Past life: ',
  }

  const setting = parsed.setting || parsed.environment || {}
  world.environment = { description: setting.overview || setting.description || '' }

  const atm = parsed.atmosphere || parsed.social_context || {}
  world.social_context = {
    macro_events: atm.history || atm.macro_events || [],
    narratives: atm.current_narratives || atm.narratives || [],
    pressures: atm.tensions || atm.pressures || [],
    institutions: atm.power_structures || atm.institutions || [],
    ambient_noise: atm.ambiance || atm.ambient_noise || [],
  }

  world.events = [
    {
      id: 'origin-0',
      type: 'world_born',
      timestamp: new Date().toISOString(),
      payload: {
        source_prompt: worldPrompt,
        theme: parsed.core_theme || parsed.narrative_seed,
        era: parsed.starting_point || parsed.initial_time,
        geography: { region: setting.region, climate: setting.climate, terrain: setting.terrain },
      },
    },
  ]

  const ext = world as WorldSnapshot & {
    world_mood?: string
    god_commands?: Array<{ id: string }>
    regions?: Array<Record<string, any>>
    organizations?: Array<Record<string, any>>
  }
  ext.world_mood = 'calm'
  ext.god_commands = []
  ext.regions = extraction.locations.map((loc, i) => ({
    id: `region-${i + 1}`,
    name: loc.name,
    description: loc.description || '',
    terrain: loc.terrain || 'plains',
    danger_level: loc.danger_level ?? 0.2,
    prosperity: loc.prosperity ?? 0.5,
    population: loc.population || 'moderate',
    notable_locations: loc.notable_locations || [],
    controlling_organization_id: null,
    resources: [],
    connections: [],
    coordinates: { x: i * 2, y: 0 },
  }))
  ext.organizations = extraction.factions.map(f => ({
    id: f.id,
    name: f.name,
    description: (f as any).description || '',
    type: f.category ?? 'other',
    status: 'stable',
    influence_score: f.influence_score ?? 50,
    military_strength: 30,
    economic_power: 30,
    cohesion: 0.5,
    public_reputation: (f as any).public_perception ?? 0,
    resources: 20,
    ideology: ((f as any).core_values || []).join('、'),
    goals: [],
    relations: [],
    territory: [],
  }))

  const suggestedCharacters: CharacterSpec[] = (parsed.extra_characters || parsed.additional_characters || []).map((c: any) =>
    createCharacterSpec({
      name: c.name || 'Unknown',
      description: c.description || '',
      story_role: c.story_role || 'background',
      faction_allegiance: c.faction_allegiance || undefined,
      expertise: c.expertise || [],
      initial_goals: [],
      core_beliefs: [],
      relationships: {},
    })
  )

  const suggestedFactions: Faction[] = (parsed.extra_factions || parsed.additional_factions || []).map((f: any) =>
    createFaction({
      name: f.name || 'Unknown Faction',
      description: f.description || '',
      alignment: f.alignment || 'neutral',
      category: f.category || 'other',
      influence: (f.influence_level as any) || 'local',
      core_values: f.core_values || [],
      public_perception: f.public_perception ?? 0,
    })
  )

  const suggestedStorylines: StorylinePreset[] = (parsed.storylines || parsed.storyline_presets || []).map((s: any) =>
    createStorylinePreset({
      title: s.title || 'Untitled',
      description: s.description || '',
      trigger_description: s.trigger_description || '',
      volume_count: s.volume_count || 3,
    })
  )

  const world_state = snapshotToWorldState(world)

  return { world, world_state, suggestedCharacters, suggestedFactions, suggestedStorylines }
}

/**
 * 世界生成主入口 — 两步流水线
 */
export async function generateWorldFromPrompt(
  options: { worldPrompt: string }
): Promise<{
  world: WorldSnapshot
  world_state: WorldState
  extractedCharacters: CharacterSpec[]
  extractedFactions: Faction[]
  suggestedCharacters: CharacterSpec[]
  suggestedFactions: Faction[]
  suggestedStorylines: StorylinePreset[]
  suppressExtraCharacters: boolean
  language: string
}> {
  const { worldPrompt } = options

  console.log('=== World Generator: Two-Step Pipeline ===')
  console.log('Step 1: Extracting entities from prompt...')

  const extraction = await parseWorldEntities(worldPrompt)

  console.log(`  ✓ Extracted ${extraction.characters.length} characters, ${extraction.factions.length} factions, ${extraction.locations.length} locations`)
  console.log(`  Language: ${extraction.language}`)
  console.log(`  Suppress extra characters: ${extraction.suppress_extra_characters}`)

  console.log('Step 2: Generating world around entities...')

  const { world, world_state, suggestedCharacters, suggestedFactions, suggestedStorylines } =
    await generateWorldAroundExtraction(worldPrompt, extraction)

  console.log(`  ✓ World generated: ${world.title || 'untitled'}`)
  console.log(`  Suggested additional: ${suggestedCharacters.length} characters, ${suggestedFactions.length} factions, ${suggestedStorylines.length} storylines`)
  console.log('=== World Generator Complete ===')

  return {
    world,
    world_state,
    extractedCharacters: extraction.characters,
    extractedFactions: extraction.factions,
    suggestedCharacters,
    suggestedFactions,
    suggestedStorylines,
    suppressExtraCharacters: extraction.suppress_extra_characters,
    language: extraction.language,
  }
}
