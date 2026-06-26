export type CharacterStatus = 'alive' | 'dead' | 'missing' | 'imprisoned' | 'exiled'

export type CharacterRelation = {
  character_id: string
  type: 'ally' | 'enemy' | 'neutral' | 'friend' | 'rival' | 'lover' | 'family' | 'mentor' | 'subordinate'
  strength: number
  notes: string
}

export type CharacterTask = {
  id: string
  description: string
  assigned_by: string | null
  priority: number
  status: 'pending' | 'active' | 'completed' | 'failed' | 'refused'
  source: 'god_command' | 'organization' | 'self' | 'event'
  deadline_tick: number | null
}

export type CharacterDesire = {
  type: 'power' | 'wealth' | 'safety' | 'revenge' | 'knowledge' | 'love' | 'freedom' | 'duty' | 'other'
  description: string
  intensity: number
}

/** 性格参数 — 影响公式系数，由行为驱动漂移 */
export type CharacterPersonalityParams = {
  stability: number     // 情绪稳定性 → 士气回归速率
  agency: number        // 主动性 → 激活阈值、影响力获取
  empathy: number       // 共情力 → 盟友加成、忠诚维护
  attachment: number    // 社交需求 → 独处惩罚、同伴加成
  openness: number      // 开放性 → 新事件影响、学识获取
}

/** 角色当前状态标签 — 每 tick 由属性组合计算 */
export type CharacterCondition =
  | 'thriving'    // 得意
  | 'content'     // 满足
  | 'struggling'  // 苦撑
  | 'desperate'   // 绝望
  | 'scheming'    // 密谋
  | 'decaying'    // 衰老
  | 'isolated'    // 孤立
  | 'critical'    // 垂危
  | 'breaking'    // 崩溃边缘
  | 'unhinged'    // 失控

export type SimCharacter = {
  id: string
  name: string
  title: string
  description: string
  personality: string[]
  abilities: string[]
  desires: CharacterDesire[]
  beliefs: string[]
  status: CharacterStatus
  location_region_id: string | null
  organization_id: string | null
  role_in_org: string
  relations: CharacterRelation[]
  current_task: CharacterTask | null
  task_queue: CharacterTask[]

  // ─── 身体属性 ───
  vitality: number        // [0,100] 生命力底线，归零即死
  health: number          // [0,100] 身体健康
  energy: number          // [0,100] 体力
  stress: number          // [0,100] 压力
  aging: number           // [0,∞)  衰老度

  // ─── 精神属性 ───
  morale: number          // [0,100] 士气
  focus: number           // [0,100] 精神集中力
  sanity: number          // [0,100] 理智

  // ─── 社会属性 ───
  influence: number       // [0,∞)  影响力
  reputation: number      // [0,∞)  公众声望
  standing: number        // [0,∞)  组织内地位
  loyalty: number         // [0,100] 组织忠诚度

  // ─── 资源属性 ───
  wealth: number          // [0,∞)  财富
  army: number            // [0,∞)  兵力
  retainers: number       // [0,∞)  追随者
  secrets: number         // [0,∞)  掌握的秘密

  // ─── 能力属性 ───
  martial: number         // [0,∞)  武力值
  cunning: number         // [0,∞)  谋略值
  charisma: number        // [0,∞)  魅力值
  lore: number            // [0,∞)  学识

  // ─── 性格参数 ───
  personality_params: CharacterPersonalityParams

  // ─── 派生标签（每 tick 计算）───
  condition: CharacterCondition
  trends?: Record<string, 'rising' | 'stable' | 'falling'>

  // ─── 其他 ───
  origin: 'user_defined' | 'llm_generated'
  last_action_tick: number
  last_action_summary: string

  // LLM-driven custom metrics system
  custom_metrics?: Record<string, number>
  custom_metric_defs?: import('./metric-schema').MetricDefinition[]
  custom_formulas?: Record<string, string>
}

/** 带 ±20% 随机偏移的默认值 */
function noisy(base: number): number {
  return base * (0.8 + Math.random() * 0.4)
}

export function createSimCharacter(id: string, name: string, initialValues?: Partial<SimCharacter>): SimCharacter {
  return {
    id,
    name,
    title: initialValues?.title ?? '',
    description: initialValues?.description ?? '',
    personality: initialValues?.personality ?? [],
    abilities: initialValues?.abilities ?? [],
    desires: initialValues?.desires ?? [],
    beliefs: initialValues?.beliefs ?? [],
    status: initialValues?.status ?? 'alive',
    location_region_id: initialValues?.location_region_id ?? null,
    organization_id: initialValues?.organization_id ?? null,
    role_in_org: initialValues?.role_in_org ?? '',
    relations: initialValues?.relations ?? [],
    current_task: initialValues?.current_task ?? null,
    task_queue: initialValues?.task_queue ?? [],

    // 身体 — 默认值带随机偏移，避免全员克隆
    vitality: initialValues?.vitality ?? noisy(80),
    health: initialValues?.health ?? noisy(80),
    energy: initialValues?.energy ?? noisy(70),
    stress: initialValues?.stress ?? noisy(20),
    aging: initialValues?.aging ?? noisy(20),

    // 精神
    morale: initialValues?.morale ?? noisy(55),
    focus: initialValues?.focus ?? noisy(60),
    sanity: initialValues?.sanity ?? noisy(80),

    // 社会
    influence: initialValues?.influence ?? noisy(1),
    reputation: initialValues?.reputation ?? noisy(1),
    standing: initialValues?.standing ?? noisy(1),
    loyalty: initialValues?.loyalty ?? noisy(50),

    // 资源
    wealth: initialValues?.wealth ?? noisy(1),
    army: initialValues?.army ?? 0,
    retainers: initialValues?.retainers ?? 0,
    secrets: initialValues?.secrets ?? 0,

    // 能力
    martial: initialValues?.martial ?? noisy(1),
    cunning: initialValues?.cunning ?? noisy(1),
    charisma: initialValues?.charisma ?? noisy(1),
    lore: initialValues?.lore ?? noisy(1),

    // 性格参数（带随机偏移，让每个角色性格不同）
    personality_params: initialValues?.personality_params ?? {
      stability: noisy(50),
      agency: noisy(50),
      empathy: noisy(50),
      attachment: noisy(50),
      openness: noisy(50),
    },

    // 派生标签
    condition: initialValues?.condition ?? 'content',

    // 其他
    origin: initialValues?.origin ?? 'llm_generated',
    last_action_tick: initialValues?.last_action_tick ?? 0,
    last_action_summary: initialValues?.last_action_summary ?? '',
    custom_metrics: initialValues?.custom_metrics ?? {},
    custom_metric_defs: initialValues?.custom_metric_defs ?? [],
    custom_formulas: initialValues?.custom_formulas ?? {},
  }
}
