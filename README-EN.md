<p align="center">
  <img src="public/icon.svg" width="200" alt="WordBox Logo"/>
</p>

<p align="center">
  <a href="README.md">中文</a> | <b>English</b>
</p>

# WordBox

A text-driven world simulator — describe a world in words, then watch it evolve on its own.

## Overview

WordBox is an LLM-powered world simulation engine. You describe a fictional world in natural language, and WordBox generates characters, factions, and regions. A deterministic math engine combined with LLM narrative generation keeps the world running autonomously.

As an observer (god's-eye view), you can:
- Watch the world change over time
- Issue commands to any character, faction, or region
- Inspect structured event logs and data dashboards
- Zoom into specific characters, conversations, and conflicts

## Key Features

- **Deterministic Simulation Engine** — Economy, stability, conflicts, and more are computed via math formulas for predictable behavior
- **LLM Narrative Generation** — Each tick produces narrative text through LLM, bringing the world to life
- **God Command System** — Issue directives to the world with multi-tick execution and narrative plans
- **Data Dashboard** — Visual charts for faction comparisons, character stats, and historical trends
- **Entity Inspector** — Click to view detailed info for characters, factions, and regions
- **Event Log** — Structured world event records

## Tech Stack

- Next.js 14 + TypeScript
- OpenAI-compatible API
- Recharts for data visualization
- Tailwind CSS (dark theme)

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your API keys

# Start the dev server
npm run dev
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
  core/sim/              Simulation engine (tick, math, formula-engine, coalition...)
  services/llm/          LLM integration (story-agent, data-agent, formula-agent...)
  services/commands/     God command system
  services/persistence/  Server-side file persistence
  ui/                    React UI components (console, dashboard, admin)
app/
  sim/                   World management pages
  api/sim/               API routes
```

## Acknowledgments

Inspired by [SeedWorld](https://github.com/zmzhace/SeedWorld), with some reference and learning.

## License

MIT
