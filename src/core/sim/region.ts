export type TerrainType =
  | 'plains'
  | 'forest'
  | 'mountains'
  | 'desert'
  | 'coast'
  | 'swamp'
  | 'tundra'
  | 'urban'
  | 'underground'

export type RegionResource = {
  type: string
  abundance: number
  controlled_by: string | null
}

export type RegionConnection = {
  region_id: string
  type: 'road' | 'river' | 'sea_route' | 'passage' | 'border'
  difficulty: number
}

export type Region = {
  id: string
  name: string
  description: string
  terrain: TerrainType
  coordinates: { x: number; y: number }
  area_size: 'tiny' | 'small' | 'medium' | 'large' | 'vast'
  population: number
  controlling_organization_id: string | null
  contested_by: string[]
  resources: RegionResource[]
  connections: RegionConnection[]
  danger_level: number
  prosperity: number
  active_event_ids: string[]
  notable_locations: string[]
  climate: string
  culture_notes: string

  // LLM-driven custom metrics system
  custom_metrics?: Record<string, number>
  custom_metric_defs?: import('./metric-schema').MetricDefinition[]
  custom_formulas?: Record<string, string>
}

export function createRegion(id: string, name: string, x: number, y: number): Region {
  return {
    id,
    name,
    description: '',
    terrain: 'plains',
    coordinates: { x, y },
    area_size: 'medium',
    population: 0,
    controlling_organization_id: null,
    contested_by: [],
    resources: [],
    connections: [],
    danger_level: 10,
    prosperity: 50,
    active_event_ids: [],
    notable_locations: [],
    climate: '',
    culture_notes: '',
    custom_metrics: {},
    custom_metric_defs: [],
    custom_formulas: {},
  }
}
