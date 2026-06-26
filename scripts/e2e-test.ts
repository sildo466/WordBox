#!/usr/bin/env npx tsx
/**
 * E2E CLI 测试工具 — 测试世界模拟引擎的完整链路
 *
 * 用法：
 *   npx tsx scripts/e2e-test.ts                     # 运行完整测试
 *   npx tsx scripts/e2e-test.ts --prompt "世界描述"   # 自定义世界
 *   npx tsx scripts/e2e-test.ts --ticks 5            # 跑 5 个 tick
 *   npx tsx scripts/e2e-test.ts --command "地震"      # 发送神命令
 *   npx tsx scripts/e2e-test.ts --skip-create        # 跳过创建，用现有世界
 *   npx tsx scripts/e2e-test.ts --world-id xxx       # 指定世界 ID
 *
 * 前提：需要先启动 dev server (npm run dev)
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const WORLDS_DIR = path.resolve(process.cwd(), 'data', 'worlds')

// ---- Types ----

interface SimEvent {
  id: string
  type: string
  title: string
  summary: string
  detail?: string
  effects?: Array<{
    target_type: string
    target_id: string
    field: string
    delta: number
    description: string
  }>
  importance?: number
}

interface TickResult {
  world: any
  new_events: SimEvent[]
  tick_narrative: string
}

// ---- Helpers ----

async function api(path: string, opts?: RequestInit): Promise<any> {
  const url = `${BASE}/api${path}`
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

async function listWorlds(): Promise<Array<{ id: string; data: any }>> {
  try {
    const files = await fs.readdir(WORLDS_DIR)
    const worlds = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const id = f.replace('.json', '')
      const raw = await fs.readFile(path.join(WORLDS_DIR, f), 'utf-8')
      const data = JSON.parse(raw)
      worlds.push({ id, data })
    }
    return worlds
  } catch {
    return []
  }
}

async function readWorld(worldId: string): Promise<any> {
  // Read from file, then apply backfill for missing fields
  const raw = await fs.readFile(path.join(WORLDS_DIR, `${worldId}.json`), 'utf-8')
  const snapshot = JSON.parse(raw)
  const ws = snapshot.world_snapshot || snapshot
  // Backfill missing organization fields
  if (Array.isArray(ws.organizations)) {
    const factionMap = new Map<string, any>()
    if (Array.isArray(ws.factions)) {
      for (const f of ws.factions) {
        factionMap.set(f.id, f)
        factionMap.set(f.name, f)
      }
    }
    for (const org of ws.organizations) {
      if (org.military_strength == null) org.military_strength = 30
      if (org.economic_power == null) org.economic_power = 30
      if (org.cohesion == null) org.cohesion = 0.5
      if (org.public_reputation == null) org.public_reputation = org.public_perception ?? 0
      if (org.resources == null) org.resources = 20
      if (!org.description) {
        const faction = factionMap.get(org.id) || factionMap.get(org.name)
        org.description = faction?.history || faction?.description || ''
      }
    }
  }
  // Backfill missing region fields
  if (Array.isArray(ws.regions)) {
    for (const region of ws.regions) {
      if (region.prosperity == null) region.prosperity = 0.5
      if (region.population == null) region.population = 'moderate'
    }
  }
  return snapshot
}

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'═'.repeat(60)}`)
}

function fmt(val: any): string {
  if (val == null) return '?'
  if (typeof val === 'number') return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(val < 10 ? 1 : 0)
  return String(val)
}

// ---- World Creation ----

async function createWorld(prompt: string): Promise<string> {
  section('创建世界')
  console.log(`  Prompt: ${prompt.slice(0, 80)}...`)

  const data = await api('/sim/init', {
    method: 'POST',
    body: JSON.stringify({ worldPrompt: prompt }),
  })

  const worldId = data.world?.world_id || data.world_state?.id
  console.log(`  ✅ 世界创建成功: ${worldId}`)
  console.log(`  角色: ${data.summary?.agents_count || 0}个`)
  console.log(`  势力: ${data.summary?.faction_count || 0}个`)
  return worldId
}

// ---- Send Command ----

async function sendCommand(worldId: string, command: string): Promise<any> {
  section(`发送神命令: "${command}"`)
  const data = await api(`/sim/${worldId}/command`, {
    method: 'POST',
    body: JSON.stringify({ raw_input: command }),
  })
  console.log(`  ✅ 命令已发送`)
  if (data.tick_result?.tick_narrative) {
    console.log(`  Tick 叙事: ${data.tick_result.tick_narrative}`)
  }
  if (data.new_events?.length > 0) {
    console.log(`  新事件 ${data.new_events.length} 个:`)
    for (const ev of data.new_events) {
      printEvent(ev)
    }
  }
  return data
}

// ---- Run Tick ----

async function runTick(worldId: string): Promise<TickResult> {
  return api(`/sim/${worldId}/tick`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ---- Print Event ----

function printEvent(ev: SimEvent) {
  console.log(`    [${ev.type}] ${ev.title}: ${ev.summary}`)
  if (ev.effects?.length) {
    for (const eff of ev.effects) {
      const sign = eff.delta > 0 ? '+' : ''
      console.log(`      ↳ ${eff.target_type}:${eff.target_id} ${eff.field} ${sign}${eff.delta} (${eff.description})`)
    }
  }
}

// ---- Inspect State ----

function inspectWorld(snapshot: any) {
  const ws = snapshot.world_snapshot || snapshot.world_state || snapshot
  const factions = ws.organizations || ws.factions || []
  const regions = ws.regions || []
  const characters = ws.characters || []
  const events = (ws.events || []).filter((e: any) => e.type && e.summary)
  const commands = ws.god_commands || []

  section('世界状态检查')

  // Organizations
  console.log(`\n  📊 组织 (${factions.length}个):`)
  for (const f of factions) {
    const desc = (f.description || f.history || '(无)').slice(0, 50)
    console.log(`    ${f.name} [${f.type || f.category || '?'}]`)
    console.log(`      描述: ${desc}`)
    console.log(`      影响力:${f.influence_score ?? '?'} 军事:${f.military_strength ?? '?'} 经济:${f.economic_power ?? '?'} 凝聚力:${f.cohesion ?? '?'} 声望:${f.public_reputation ?? f.public_perception ?? '?'}`)
  }

  // Regions
  console.log(`\n  🗺️ 地区 (${regions.length}个):`)
  for (const r of regions) {
    const desc = (r.description || '(无)').slice(0, 50)
    console.log(`    ${r.name} [${r.terrain || '?'}]`)
    console.log(`      描述: ${desc}`)
    console.log(`      危险:${r.danger_level ?? '?'} 繁荣:${r.prosperity ?? '?'} 人口:${r.population ?? '?'}`)
  }

  // Characters
  console.log(`\n  👤 角色 (${characters.length}个):`)
  for (const c of characters.slice(0, 5)) {
    const condition = c.condition || '?'
    const org = c.organization_id ? `组织:${c.organization_id.slice(0, 8)}` : '无组织'
    const pp = c.personality_params
    console.log(`    ${c.name} [${condition}] ${org}`)
    console.log(`      身体: 生命${fmt(c.vitality)} 健康${fmt(c.health)} 体力${fmt(c.energy)} 压力${fmt(c.stress)} 衰老${fmt(c.aging)}`)
    console.log(`      精神: 士气${fmt(c.morale)} 集中${fmt(c.focus)} 理智${fmt(c.sanity)}`)
    console.log(`      社会: 影响${fmt(c.influence)} 声望${fmt(c.reputation)} 地位${fmt(c.standing)} 忠诚${fmt(c.loyalty)}`)
    console.log(`      资源: 财富${fmt(c.wealth)} 兵力${fmt(c.army)} 追随${fmt(c.retainers)} 秘密${fmt(c.secrets)}`)
    console.log(`      能力: 武力${fmt(c.martial)} 谋略${fmt(c.cunning)} 魅力${fmt(c.charisma)} 学识${fmt(c.lore)}`)
    if (pp) console.log(`      性格: 稳定${fmt(pp.stability)} 能动${fmt(pp.agency)} 共情${fmt(pp.empathy)} 依恋${fmt(pp.attachment)} 开放${fmt(pp.openness)}`)
    if (c.trends) {
      const trendStr = Object.entries(c.trends).filter(([,v]) => v !== 'stable').map(([k,v]) => `${k}${v === 'rising' ? '↑' : '↓'}`).join(' ')
      if (trendStr) console.log(`      趋势: ${trendStr}`)
    }
  }
  if (characters.length > 5) console.log(`    ... 还有 ${characters.length - 5} 个`)

  // Diversity check
  if (characters.length >= 2) {
    console.log(`\n  🔍 角色差异化检查:`)
    const attrs = ['vitality','health','energy','stress','morale','influence','martial','cunning','charisma','lore','wealth']
    let diverseCount = 0
    for (const attr of attrs) {
      const vals = characters.map((c: any) => c[attr]).filter((v: any) => v != null)
      if (vals.length < 2) continue
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const range = max - min
      const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
      const diverse = range > avg * 0.1 || range > 2
      if (diverse) diverseCount++
      console.log(`    ${diverse ? '✅' : '⚠️'} ${attr}: min=${fmt(min)} max=${fmt(max)} range=${fmt(range)} avg=${fmt(avg)}`)
    }
    console.log(`    → ${diverseCount}/${attrs.length} 个属性有明显差异`)
  }

  // Commands
  if (commands.length > 0) {
    console.log(`\n  ⚡ 神命令 (${commands.length}个):`)
    for (const cmd of commands) {
      console.log(`    [${cmd.status}] "${cmd.raw_input}" → ${cmd.target_name || '世界'}`)
      if (cmd.status === 'executing') {
        console.log(`      进度: ${Math.round((cmd.progress || 0) * 100)}% | 已执行: ${cmd.total_ticks_worked || 0}轮`)
      }
      if (cmd.feedback) console.log(`      反馈: ${cmd.feedback.slice(0, 80)}`)
    }
  }

  // Recent events
  if (events.length > 0) {
    console.log(`\n  📜 事件 (${events.length}个):`)
    for (const ev of events.slice(-5)) {
      console.log(`    [${ev.type}] ${ev.title}: ${ev.summary}`)
    }
  }

  return { factions, regions, characters, events, commands }
}

// ---- Check Effects Applied ----

function checkEffectsApplied(before: any, after: any): boolean {
  const bws = before.world_snapshot || before
  const aws = after.world_snapshot || after
  let changed = false

  // Check factions/organizations
  const bf = bws.factions || bws.organizations || []
  const af = aws.factions || aws.organizations || []
  for (const afterF of af) {
    const beforeF = bf.find((b: any) => b.id === afterF.id || b.name === afterF.name)
    if (!beforeF) continue
    for (const key of ['influence_score', 'military_strength', 'economic_power', 'cohesion', 'public_reputation', 'resources']) {
      const bv = beforeF[key]
      const av = afterF[key]
      if (bv !== av && (bv != null || av != null)) {
        console.log(`    ✅ [组织] ${afterF.name}.${key}: ${bv ?? '?'} → ${av ?? '?'}`)
        changed = true
      }
    }
  }

  // Check regions
  const br = bws.regions || []
  const ar = aws.regions || []
  for (const afterR of ar) {
    const beforeR = br.find((b: any) => b.id === afterR.id || b.name === afterR.name)
    if (!beforeR) continue
    for (const key of ['danger_level', 'prosperity', 'population']) {
      const bv = beforeR[key]
      const av = afterR[key]
      if (bv !== av && (bv != null || av != null)) {
        console.log(`    ✅ [地区] ${afterR.name}.${key}: ${bv ?? '?'} → ${av ?? '?'}`)
        changed = true
      }
    }
  }

  // Check characters (20 属性)
  const bc = bws.characters || []
  const ac = aws.characters || []
  const charKeys = [
    'vitality', 'health', 'energy', 'stress', 'aging',
    'morale', 'focus', 'sanity',
    'influence', 'reputation', 'standing', 'loyalty',
    'wealth', 'army', 'retainers', 'secrets',
    'martial', 'cunning', 'charisma', 'lore',
  ]
  for (const afterC of ac) {
    const beforeC = bc.find((b: any) => b.id === afterC.id || b.name === afterC.name)
    if (!beforeC) continue
    for (const key of charKeys) {
      const bv = beforeC[key]
      const av = afterC[key]
      if (bv !== av && (bv != null || av != null)) {
        const diff = typeof bv === 'number' && typeof av === 'number' ? (av - bv > 0 ? '+' : '') + (av - bv).toFixed(1) : ''
        console.log(`    ✅ [角色] ${afterC.name}.${key}: ${fmt(bv)} → ${fmt(av)} ${diff ? `(${diff})` : ''}`)
        changed = true
      }
    }
  }

  return changed
}

// ---- Main ----

async function main() {
  const args = process.argv.slice(2)
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const hasFlag = (flag: string) => args.includes(flag)

  const customPrompt = getArg('--prompt')
  const tickCount = parseInt(getArg('--ticks') || '3', 10)
  const command = getArg('--command')
  const skipCreate = hasFlag('--skip-create')
  let worldId = getArg('--world-id')

  console.log('🧪 WordBox E2E 测试工具')
  console.log(`   目标: ${BASE}`)

  // Step 1: Create or find world
  if (!skipCreate && !worldId) {
    const prompt = customPrompt || '一个被四大势力争夺的大陆：北方的冰霜帝国、南方的火焰教廷、东方的暗影商会、西方的自然同盟。主要角色包括帝国将军阿尔萨斯、教廷圣女莉亚、商会首领暗夜、同盟长老古树。'
    worldId = await createWorld(prompt)
  }

  if (!worldId) {
    const worlds = await listWorlds()
    if (worlds.length === 0) {
      console.error('❌ 没有找到世界，请先创建一个')
      process.exit(1)
    }
    // Use the most recently modified world
    worldId = worlds[worlds.length - 1].id
    console.log(`  使用现有世界: ${worldId}`)
  }

  // Step 2: Inspect initial state
  let snapshot = await readWorld(worldId)
  let { factions, regions, commands } = inspectWorld(snapshot)

  // Step 3: Send command if provided
  if (command) {
    await sendCommand(worldId, command)
    snapshot = await readWorld(worldId)
  }

  // Step 4: Run ticks
  section(`运行 ${tickCount} 个 Tick`)
  for (let i = 1; i <= tickCount; i++) {
    console.log(`\n  --- Tick ${i} ---`)
    const before = await readWorld(worldId)

    let result: TickResult
    try {
      result = await runTick(worldId)
    } catch (err: any) {
      console.error(`  ❌ Tick ${i} 失败: ${err.message}`)
      continue
    }

    console.log(`  叙事: ${result.tick_narrative || '(无)'}`)
    console.log(`  新事件: ${result.new_events?.length || 0}个`)

    if (result.new_events?.length) {
      for (const ev of result.new_events) {
        printEvent(ev)
      }
    }

    // Check if effects actually changed stats
    const after = await readWorld(worldId)
    console.log(`\n  数值变化检查:`)
    const changed = checkEffectsApplied(before, after)
    if (!changed) {
      console.log(`    ⚠️ 没有检测到数值变化！`)
    }
  }

  // Step 5: Final inspection
  snapshot = await readWorld(worldId)
  inspectWorld(snapshot)

  // Step 6: Command effect check
  if (command) {
    section('命令效果检查')
    const ws = snapshot.world_snapshot || snapshot
    const events = (ws.events || []).filter((e: any) =>
      e.summary?.includes(command.slice(0, 5)) || e.title?.includes(command.slice(0, 5)) ||
      e.type === 'god_command'
    )
    if (events.length > 0) {
      console.log(`  ✅ 找到 ${events.length} 个相关事件`)
      for (const ev of events.slice(-3)) {
        console.log(`    [${ev.type}] ${ev.title}: ${ev.summary}`)
      }
    } else {
      console.log(`  ❌ 未找到与命令相关的事件`)
    }

    const cmds = ws.god_commands || []
    const cmd = cmds.find((c: any) => c.raw_input?.includes(command.slice(0, 5)))
    if (cmd) {
      console.log(`  命令状态: ${cmd.status}`)
      if (cmd.status === 'executing') {
        console.log(`  ✅ 命令正在执行中 (进度: ${Math.round((cmd.progress || 0) * 100)}%)`)
      } else if (cmd.status === 'completed') {
        console.log(`  ℹ️ 命令已完成`)
      }
    } else {
      console.log(`  ⚠️ 未找到命令记录`)
    }
  }

  section('测试完成')
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message)
  process.exit(1)
})
