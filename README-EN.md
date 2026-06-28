<p align="center">
  <img src="public/icon.svg" width="200" alt="WordBox Logo"/>
</p>

<p align="center">
  <a href="README.md">中文</a> | <b>English</b>
</p>

# WordBox

A text-driven world simulator — describe a world in words, then watch it evolve on its own.

> **Current Version: V1.1.0** — New Battle Mode

## Overview

WordBox is an LLM-powered world simulation engine. You describe a fictional world in natural language, and WordBox generates characters, factions, and regions. A deterministic math engine combined with LLM narrative generation keeps the world running autonomously.

As an observer (god's-eye view), you can:
- Watch the world change over time
- Issue commands to any character, faction, or region
- Inspect structured event logs and data dashboards
- Zoom into specific characters, conversations, and conflicts
- **Battle a friend in real-time, each playing as a deity of a faction**

## Key Features

- **Deterministic Simulation Engine** — Economy, stability, conflicts, and more are computed via math formulas for predictable behavior
- **LLM Narrative Generation** — Each tick produces narrative text through LLM, bringing the world to life
- **God Command System** — Issue directives to the world with multi-tick execution and narrative plans
- **Data Dashboard** — Visual charts for faction comparisons, character stats, and historical trends
- **Entity Inspector** — Click to view detailed info for characters, factions, and regions
- **Event Log** — Structured world event records
- **⚔️ Battle Mode (New)** — Real-time 1v1 battle via WebSocket, each player controls a faction
- **🌫️ Fog of War** — Shared world data in battle mode, but opponent's commands are hidden
- **🏆 Victory Detection** — Automatic win/loss判定 via faction collapse, surrender, or leader death

## Tech Stack

- Next.js 14 + TypeScript
- OpenAI-compatible API
- WebSocket (ws) for real-time communication
- Recharts for data visualization
- Tailwind CSS (dark theme)

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your API keys

# Start the dev server (single-player mode)
pnpm dev

# Start server with WebSocket battle support
npm run dev:server
```

Visit `http://localhost:3000` to get started.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WORDBOX_API_BASE` | LLM API endpoint | `https://api.openai.com/v1` |
| `WORDBOX_API_KEY` | LLM API key | — |
| `WORDBOX_MODEL` | Model to use | `gpt-4o-mini` |

## Project Structure

```
src/
  core/                  Domain models (WorldSnapshot, SimAgent, SimCharacter...)
  core/sim/              Simulation engine (tick, math, formula-engine, coalition, battle, fog-of-war, victory...)
  services/llm/          LLM integration (story-agent, data-agent, formula-agent, battle-world-gen...)
  services/commands/     God command system
  services/battle/       Battle room management (room-manager, tick-driver, ws-handler)
  services/persistence/  Server-side file persistence
  ui/                    React UI components (console, dashboard, admin, battle)
app/
  sim/                   World management pages
  battle/                Battle mode pages (lobby, battle dashboard, victory screen)
  api/sim/               API routes
server.ts                Custom server with integrated WebSocket
```

## Changelog

### V1.1.0 (2026-06-28)

**🎮 New: Battle Mode**

- **Real-time 1v1 Battle** — Two players each control a faction as a deity, competing in the same world using natural language commands
- **Room System** — Create room → Wait for opponent → Auto-generate battle world → Preview → Pick factions → Battle begins
- **WebSocket Communication** — Low-latency bidirectional communication via custom server
- **Fog of War** — Shared world data with hidden opponent commands for strategic depth
- **Victory Detection** — Multiple win/loss conditions: faction collapse, surrender, leader death
- **Battle UI** — Brand new lobby, battle dashboard, data panels, and victory screen

**🔧 Improvements**

- Rebalanced economy constants to fix org economic decline and character wealth staying at 0
- Fixed agent-character ID mismatch causing empty relations

### V1.0.0

- Initial release
- Deterministic simulation engine + LLM narrative generation
- God command system
- Data dashboard and entity inspector

## Acknowledgments

Inspired by [SeedWorld](https://github.com/zmzhace/SeedWorld), with some reference and learning.

## License

MIT
