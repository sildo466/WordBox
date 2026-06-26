<p align="center">
  <img src="public/icon.svg" width="200" alt="WordBox Logo"/>
</p>

<p align="center">
  <b>中文</b> | <a href="README-EN.md">English</a>
</p>

# WordBox

文本驱动的世界模拟器 — 用文字描述一个世界，观察它自行运转。

## 简介

WordBox 是一个基于 LLM 的世界模拟引擎。你用自然语言描述一个世界的背景设定，WordBox 会生成角色、势力、地区，然后通过确定性数学引擎和 LLM 叙事生成相结合的方式，让这个世界自主运转。

作为观察者（上帝视角），你可以：
- 观察世界随时间推移发生的变化
- 向任何角色、势力或地区下达指令
- 查看结构化的事件日志和数据看板
- 缩放到具体的角色、对话和冲突

## 核心特性

- **确定性模拟引擎** — 经济、稳定度、冲突等通过数学公式计算，保证可预测性
- **LLM 叙事生成** — 每个 tick 由 LLM 生成叙事文本，赋予世界生命力
- **神谕命令系统** — 向世界下达指令，支持多 tick 执行和叙事计划
- **数据看板** — 势力对比、角色状态、历史趋势的可视化图表
- **实体检查器** — 点击查看角色、势力、地区的详细信息
- **事件日志** — 结构化的世界事件记录

## 技术栈

- Next.js 14 + TypeScript
- OpenAI 兼容 API
- Recharts 数据可视化
- Tailwind CSS（暗色主题）

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 API 密钥

# 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 开始使用。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WORDBOX_API_BASE` | LLM API 地址 | `https://api.openai.com/v1` |
| `WORDBOX_API_KEY` | LLM API 密钥 | — |
| `WORDBOX_MODEL` | 使用的模型 | `gpt-4o-mini` |

## 项目结构

```
src/
  core/                领域模型（WorldSnapshot, SimAgent, SimCharacter...）
  core/sim/            模拟引擎（tick, math, formula-engine, coalition...）
  services/llm/        LLM 调用层（story-agent, data-agent, formula-agent...）
  services/commands/   神谕命令系统
  services/persistence 服务端文件持久化
  ui/                  React UI 组件（console, dashboard, admin）
app/
  sim/                 世界管理页面
  api/sim/             API 路由
```

## 致谢

本项目灵感来源于 [SeedWorld](https://github.com/zmzhace/SeedWorld)，并稍作参考与学习。

## 许可证

MIT
