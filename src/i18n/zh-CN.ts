export const zhCN = {
  // Shell header
  'shell.title': '文字 Worldbox · 上帝视角控制台',
  'shell.unnamed': '未命名世界',

  // Tick control
  'tick.label': '第{n}轮',
  'tick.stepping': '世界正在推进...',
  'tick.done': 'Tick {n} 完成',
  'tick.failed': '推进失败，请检查服务端日志',

  // Mobile panels
  'panel.overview': '总览',
  'panel.events': '事件',
  'panel.commands': '命令',
  'panel.inspector': '实体',

  // World stage
  'stage.sandbox': '世界沙盘',
  'stage.viewEntity': '查看世界实体',
  'stage.noRegions': '暂无地区数据',
  'stage.noOrgs': '暂无组织数据',
  'stage.noChars': '暂无角色数据',
  'stage.empty': '世界静待开始：点击「单步」推进 tick，或开启「自动」让世界自行运转',

  // Metric cards
  'metric.tick': 'Tick',
  'metric.regions': '地区',
  'metric.orgs': '组织',
  'metric.chars': '角色',
  'metric.events': '事件',

  // Sections
  'section.regions': '地区',
  'section.orgs': '主要组织',
  'section.chars': '关键角色',
  'section.events': '重要事件',

  // Event detail
  'event.back': '返回世界视图',
  'event.type': '类型',
  'event.importance': '重要度',
  'event.entities': '相关实体',
  'event.actor': '行动者',
  'event.target': '目标',
  'event.location': '地区',
  'event.effects': '影响',
  'event.tags': '标签',

  // Command panel
  'cmd.placeholder': '输入神的旨意...',
  'cmd.submit': '下达',
  'cmd.submitting': '解析中...',
  'cmd.history': '命令历史',
  'cmd.empty': '输入命令改变世界',

  // Event log
  'log.title': '事件流',
  'log.filter.all': '全部',
  'log.empty': '暂无事件',

  // Entity inspector
  'inspector.title': '实体查看器',
  'inspector.select': '点击实体查看详情',
  'inspector.world': '世界',
  'inspector.region': '地区',
  'inspector.org': '组织',
  'inspector.char': '角色',

  // Overview panel
  'overview.worldState': '世界状态',
  'overview.mood': '基调',
  'overview.factions': '势力',
  'overview.recentEvents': '近期事件',

  // Dashboard
  'dashboard.title': '📊 数据看板',
  'dashboard.back': '返回控制台',
  'dashboard.tab.overview': '📊 总览',
  'dashboard.tab.map': '🗺️ 地图',
  'dashboard.tab.factions': '⚔️ 势力',
  'dashboard.tab.characters': '👤 角色',

  // Map
  'map.layer': '图层：',
  'map.layer.faction': '势力控制',
  'map.layer.danger': '危险度',
  'map.layer.prosperity': '繁荣度',
  'map.layer.population': '人口',
  'map.noData': '暂无地区数据',

  // Dashboard metrics
  'dashboard.snapshots': '快照数',
  'dashboard.history': '历史',
  'dashboard.mood': '基调',
  'dashboard.needMoreData': '需要至少 2 个 tick 的数据才能显示趋势',

  // Faction detail
  'faction.select': '选择势力查看详情',
  'faction.influence': '影响力',
  'faction.military': '军事力量',
  'faction.economy': '经济实力',
  'faction.cohesion': '凝聚力',
  'faction.reputation': '公众声誉',
  'faction.resources': '资源',
  'faction.goals': '目标',
  'faction.diplomacy': '外交关系',
  'faction.members': '成员',
  'faction.territory': '领地',

  // Character detail
  'char.select': '选择角色查看详情',
  'char.vitality': '活力',
  'char.morale': '士气',
  'char.influence': '影响力',
  'char.wealth': '财富',
  'char.personality': '性格',
  'char.abilities': '能力',
  'char.desires': '欲望',
  'char.currentTask': '当前任务',
  'char.relations': '关系',
  'char.trend': '属性趋势',

  // Status labels
  'status.alive': '存活',
  'status.dead': '死亡',
  'status.missing': '失踪',
  'status.imprisoned': '囚禁',
  'status.exiled': '流放',
  'status.rising': '崛起',
  'status.stable': '稳定',
  'status.declining': '衰落',
  'status.collapsed': '崩溃',

  // Relation types
  'relation.ally': '盟友',
  'relation.enemy': '敌对',
  'relation.neutral': '中立',
  'relation.friend': '友方',
  'relation.rival': '竞争',
  'relation.lover': '恋人',
  'relation.family': '家族',
  'relation.mentor': '导师',
  'relation.subordinate': '从属',
} as const

export type ZhCNKey = keyof typeof zhCN
