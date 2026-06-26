export const enUS = {
  // Shell header
  'shell.title': 'Text Worldbox · God View Console',
  'shell.unnamed': 'Untitled World',

  // Tick control
  'tick.label': 'Era {n}',
  'tick.stepping': 'World advancing...',
  'tick.done': 'Tick {n} complete',
  'tick.failed': 'Tick failed, check server logs',

  // Mobile panels
  'panel.overview': 'Overview',
  'panel.events': 'Events',
  'panel.commands': 'Commands',
  'panel.inspector': 'Inspector',

  // World stage
  'stage.sandbox': 'World Sandbox',
  'stage.viewEntity': 'View World Entity',
  'stage.noRegions': 'No region data',
  'stage.noOrgs': 'No organization data',
  'stage.noChars': 'No character data',
  'stage.empty': 'World awaits: click "Step" to advance a tick, or enable "Auto" to let the world run',

  // Metric cards
  'metric.tick': 'Tick',
  'metric.regions': 'Regions',
  'metric.orgs': 'Orgs',
  'metric.chars': 'Chars',
  'metric.events': 'Events',

  // Sections
  'section.regions': 'Regions',
  'section.orgs': 'Major Organizations',
  'section.chars': 'Key Characters',
  'section.events': 'Important Events',

  // Event detail
  'event.back': 'Back to World View',
  'event.type': 'Type',
  'event.importance': 'Importance',
  'event.entities': 'Related Entities',
  'event.actor': 'Actor',
  'event.target': 'Target',
  'event.location': 'Region',
  'event.effects': 'Effects',
  'event.tags': 'Tags',

  // Command panel
  'cmd.placeholder': "Enter god's will...",
  'cmd.submit': 'Issue',
  'cmd.submitting': 'Parsing...',
  'cmd.history': 'Command History',
  'cmd.empty': 'Enter commands to change the world',

  // Event log
  'log.title': 'Event Stream',
  'log.filter.all': 'All',
  'log.empty': 'No events',

  // Entity inspector
  'inspector.title': 'Entity Inspector',
  'inspector.select': 'Click an entity to view details',
  'inspector.world': 'World',
  'inspector.region': 'Region',
  'inspector.org': 'Organization',
  'inspector.char': 'Character',

  // Overview panel
  'overview.worldState': 'World State',
  'overview.mood': 'Mood',
  'overview.factions': 'Factions',
  'overview.recentEvents': 'Recent Events',

  // Dashboard
  'dashboard.title': '📊 Dashboard',
  'dashboard.back': 'Back to Console',
  'dashboard.tab.overview': '📊 Overview',
  'dashboard.tab.map': '🗺️ Map',
  'dashboard.tab.factions': '⚔️ Factions',
  'dashboard.tab.characters': '👤 Characters',

  // Map
  'map.layer': 'Layer:',
  'map.layer.faction': 'Faction Control',
  'map.layer.danger': 'Danger',
  'map.layer.prosperity': 'Prosperity',
  'map.layer.population': 'Population',
  'map.noData': 'No region data',

  // Dashboard metrics
  'dashboard.snapshots': 'Snapshots',
  'dashboard.history': 'History',
  'dashboard.mood': 'Mood',
  'dashboard.needMoreData': 'Need at least 2 ticks of data to show trends',

  // Faction detail
  'faction.select': 'Select a faction to view details',
  'faction.influence': 'Influence',
  'faction.military': 'Military',
  'faction.economy': 'Economy',
  'faction.cohesion': 'Cohesion',
  'faction.reputation': 'Reputation',
  'faction.resources': 'Resources',
  'faction.goals': 'Goals',
  'faction.diplomacy': 'Diplomacy',
  'faction.members': 'Members',
  'faction.territory': 'Territory',

  // Character detail
  'char.select': 'Select a character to view details',
  'char.vitality': 'Vitality',
  'char.morale': 'Morale',
  'char.influence': 'Influence',
  'char.wealth': 'Wealth',
  'char.personality': 'Personality',
  'char.abilities': 'Abilities',
  'char.desires': 'Desires',
  'char.currentTask': 'Current Task',
  'char.relations': 'Relations',
  'char.trend': 'Attribute Trends',

  // Status labels
  'status.alive': 'Alive',
  'status.dead': 'Dead',
  'status.missing': 'Missing',
  'status.imprisoned': 'Imprisoned',
  'status.exiled': 'Exiled',
  'status.rising': 'Rising',
  'status.stable': 'Stable',
  'status.declining': 'Declining',
  'status.collapsed': 'Collapsed',

  // Relation types
  'relation.ally': 'Ally',
  'relation.enemy': 'Enemy',
  'relation.neutral': 'Neutral',
  'relation.friend': 'Friend',
  'relation.rival': 'Rival',
  'relation.lover': 'Lover',
  'relation.family': 'Family',
  'relation.mentor': 'Mentor',
  'relation.subordinate': 'Subordinate',
} as const

export type EnUSKey = keyof typeof enUS
