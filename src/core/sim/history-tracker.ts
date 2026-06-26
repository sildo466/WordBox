/**
 * Records per-tick snapshots of world metrics for dashboard history.
 * Called at the end of each simulation tick.
 */

import type { WorldSnapshot } from '@/core/world'
import type { TickSnapshot, OrgSnapshot, CharSnapshot, RegionSnapshot } from '@/core/sim/history-snapshot'
import { MAX_HISTORY_SNAPSHOTS } from '@/core/sim/history-snapshot'

/**
 * Extract current metrics from the world and append a TickSnapshot.
 * Mutates world.history_snapshots in place (trims to MAX_HISTORY_SNAPSHOTS).
 */
export function recordSnapshot(world: WorldSnapshot, newEventCount: number): void {
  const w = world as any
  if (!Array.isArray(w.history_snapshots)) {
    w.history_snapshots = []
  }

  const orgs: OrgSnapshot[] = (w.organizations ?? w.factions ?? []).map((org: any) => ({
    id: String(org.id ?? ''),
    name: String(org.name ?? ''),
    influence_score: Number(org.influence_score ?? 0),
    military_strength: Number(org.military_strength ?? 0),
    economic_power: Number(org.economic_power ?? 0),
    cohesion: Number(org.cohesion ?? 0),
    public_reputation: Number(org.public_reputation ?? org.public_perception ?? 0),
    resources: Number(org.resources ?? 0),
    member_count: Array.isArray(org.member_ids) ? org.member_ids.length : 0,
    custom_metrics: org.custom_metrics ?? {},
    population: Number(org.population ?? 0),
  }))

  const chars: CharSnapshot[] = (w.characters ?? []).map((char: any) => ({
    id: String(char.id ?? ''),
    name: String(char.name ?? ''),
    organization_id: char.organization_id ?? char.faction_id ?? null,
    // 身体
    vitality: Number(char.vitality ?? 80),
    health: Number(char.health ?? 80),
    energy: Number(char.energy ?? 70),
    stress: Number(char.stress ?? 20),
    aging: Number(char.aging ?? 20),
    // 精神
    morale: Number(char.morale ?? 55),
    focus: Number(char.focus ?? 60),
    sanity: Number(char.sanity ?? 80),
    // 社会
    influence: Number(char.influence ?? 1),
    reputation: Number(char.reputation ?? 1),
    standing: Number(char.standing ?? 1),
    loyalty: Number(char.loyalty ?? 50),
    // 资源
    wealth: Number(char.wealth ?? 1),
    army: Number(char.army ?? 0),
    retainers: Number(char.retainers ?? 0),
    secrets: Number(char.secrets ?? 0),
    // 能力
    martial: Number(char.martial ?? 1),
    cunning: Number(char.cunning ?? 1),
    charisma: Number(char.charisma ?? 1),
    lore: Number(char.lore ?? 1),
    // 状态
    condition: char.condition,
    custom_metrics: char.custom_metrics ?? {},
  }))

  const regions: RegionSnapshot[] = (w.regions ?? []).map((region: any) => ({
    id: String(region.id ?? ''),
    name: String(region.name ?? ''),
    danger_level: Number(region.danger_level ?? 0),
    prosperity: Number(region.prosperity ?? 50),
    population: region.population ?? 0,
    controlling_organization_id: region.controlling_organization_id ?? null,
    custom_metrics: region.custom_metrics ?? {},
  }))

  const snapshot: TickSnapshot = {
    tick: world.tick ?? 0,
    timestamp: Date.now(),
    organizations: orgs,
    characters: chars,
    regions,
    world_mood: w.world_mood ?? 'calm',
    event_count: newEventCount,
  }

  w.history_snapshots.push(snapshot)

  // Trim to max size
  if (w.history_snapshots.length > MAX_HISTORY_SNAPSHOTS) {
    w.history_snapshots = w.history_snapshots.slice(-MAX_HISTORY_SNAPSHOTS)
  }
}
