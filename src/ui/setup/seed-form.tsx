'use client'

import React from 'react'
import { Mountain, Users, Swords, Pen, Globe, Sparkles } from 'lucide-react'

type Props = {
  onSubmit: (prompt: string, options: WorldSeedOptions) => void
  isGenerating: boolean
}

export type WorldSeedOptions = {
  style: 'realistic' | 'fantasy' | 'scifi' | 'postapocalyptic' | 'custom'
  complexity: 'simple' | 'moderate' | 'complex'
  maxRegions: number
  maxOrganizations: number
  maxCharacters: number
}

const STYLE_OPTIONS = [
  { value: 'fantasy', label: '奇幻', desc: '魔法、龙、中世纪王国', icon: '🏰' },
  { value: 'realistic', label: '写实', desc: '现实世界风格', icon: '🌍' },
  { value: 'scifi', label: '科幻', desc: '太空、AI、未来科技', icon: '🚀' },
  { value: 'postapocalyptic', label: '末日', desc: '废土、生存、重建', icon: '☢️' },
  { value: 'custom', label: '自定义', desc: '完全自由描述', icon: '✨' },
] as const

const COMPLEXITY_OPTIONS = [
  { value: 'simple', label: '简单', desc: '3-4个地区，2-3个势力', regions: 4, orgs: 3, chars: 6 },
  { value: 'moderate', label: '中等', desc: '5-7个地区，4-5个势力', regions: 6, orgs: 5, chars: 10 },
  { value: 'complex', label: '复杂', desc: '8-12个地区，6-8个势力', regions: 10, orgs: 8, chars: 16 },
] as const

export function WorldSeedForm({ onSubmit, isGenerating }: Props) {
  const [prompt, setPrompt] = React.useState('')
  const [style, setStyle] = React.useState<WorldSeedOptions['style']>('fantasy')
  const [complexity, setComplexity] = React.useState<WorldSeedOptions['complexity']>('moderate')

  const complexityConfig = COMPLEXITY_OPTIONS.find(c => c.value === complexity)!

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isGenerating) return

    onSubmit(prompt, {
      style,
      complexity,
      maxRegions: complexityConfig.regions,
      maxOrganizations: complexityConfig.orgs,
      maxCharacters: complexityConfig.chars,
    })
  }

  const tips = [
    { icon: Mountain, title: '地貌', desc: '山川河流、资源分布、气候带' },
    { icon: Users, title: '势力', desc: '阵营、领袖、组织结构与目标' },
    { icon: Swords, title: '争端', desc: '领土纠纷、资源争夺、信仰对立' },
    { icon: Pen, title: '氛围', desc: '世界的情绪底色与叙事风格' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* World premise */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          <Globe className="mr-1.5 inline h-4 w-4 text-cyan-400" />
          世界观设定
        </label>
        <textarea
          rows={6}
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 transition-all focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          placeholder="一座漂浮在云层之上的群岛，各族争夺稀缺的天空矿石...&#10;&#10;或者：深海文明发现了一条通往地心的裂缝，古老的意志正在苏醒..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
        />
        <p className="mt-2 text-xs text-slate-600">
          可以写世界观、关键人物、势力关系，也可以只写一句话让 AI 自由发挥。
        </p>
      </div>

      {/* Style selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">世界风格</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STYLE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStyle(opt.value)}
              className={`rounded-lg border p-3 text-left transition ${
                style === opt.value
                  ? 'border-cyan-500 bg-cyan-950/30'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              }`}
              disabled={isGenerating}
            >
              <div className="text-lg">{opt.icon}</div>
              <div className="mt-1 text-xs font-medium text-slate-200">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Complexity selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">世界复杂度</label>
        <div className="grid grid-cols-3 gap-2">
          {COMPLEXITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setComplexity(opt.value)}
              className={`rounded-lg border p-3 text-left transition ${
                complexity === opt.value
                  ? 'border-cyan-500 bg-cyan-950/30'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              }`}
              disabled={isGenerating}
            >
              <div className="text-xs font-medium text-slate-200">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-6 py-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-cyan-500 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? (
          <>
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span>正在生成世界...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>生成世界</span>
          </>
        )}
      </button>

      {/* Tips */}
      <div className="border-t border-slate-800 pt-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-600">可以写这些</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {tips.map(tip => (
            <div key={tip.title} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2">
                <tip.icon className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-400">{tip.title}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </form>
  )
}
