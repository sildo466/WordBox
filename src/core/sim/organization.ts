export type OrganizationType =
  | 'kingdom'
  | 'empire'
  | 'republic'
  | 'tribe'
  | 'guild'
  | 'church'
  | 'merchant_company'
  | 'criminal_syndicate'
  | 'secret_society'
  | 'mercenary_band'
  | 'other'

export type OrgRelation = {
  organization_id: string
  type: 'ally' | 'enemy' | 'neutral' | 'vassal' | 'overlord' | 'rival' | 'trading_partner'
  strength: number
  notes: string
}

export type OrgGoal = {
  id: string
  description: string
  priority: number
  progress: number
  status: 'active' | 'completed' | 'abandoned'
}

export type OrgResource = {
  type: string
  amount: number
  max_capacity: number
}

export type Organization = {
  id: string
  name: string
  type: OrganizationType
  description: string
  ideology: string
  goals: OrgGoal[]
  resources: OrgResource[]
  relations: OrgRelation[]
  territory: string[]
  member_ids: string[]
  leader_id: string | null
  influence_score: number
  military_strength: number
  economic_power: number
  cohesion: number
  public_reputation: number
  founding_tick: number
  status: 'rising' | 'stable' | 'declining' | 'collapsed'
  headquarters_region_id: string | null

  // LLM-driven custom metrics system
  custom_metrics?: Record<string, number>
  custom_metric_defs?: import('./metric-schema').MetricDefinition[]
  custom_formulas?: Record<string, string>
  scale?: import('./metric-schema').ScaleDefinition
  population?: number

  // Phase 1: 组织性格 + 记忆
  personality?: import('./org-personality').OrgPersonality
  memory?: import('./org-memory').OrgMemoryStore

  // Phase 2: 声誉 + 外交 + 联盟
  reputation?: import('./org-reputation').OrgReputation
  treaties?: import('./diplomacy').Treaty[]

  // Phase 3: 多类型资源
  resource_pool?: import('./org-resources').OrgResourcePool

  // Phase 5: 注意力
  attention_fatigue?: number
}

export function createOrganization(id: string, name: string, type: OrganizationType): Organization {
  return {
    id,
    name,
    type,
    description: '',
    ideology: '',
    goals: [],
    resources: [],
    relations: [],
    territory: [],
    member_ids: [],
    leader_id: null,
    influence_score: 30,
    military_strength: 30,
    economic_power: 30,
    cohesion: 70,
    public_reputation: 50,
    founding_tick: 0,
    status: 'stable',
    headquarters_region_id: null,
    custom_metrics: {},
    custom_metric_defs: [],
    custom_formulas: {},
    population: 0,
    // Phase 1: 性格 + 记忆
    personality: undefined,
    memory: undefined,
    // Phase 2: 声誉 + 外交
    reputation: undefined,
    treaties: [],
    // Phase 3: 多类型资源
    resource_pool: undefined,
    // Phase 5: 注意力
    attention_fatigue: 0,
  }
}
