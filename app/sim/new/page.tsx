'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Box, Sparkles } from 'lucide-react'
import { WorldSeedForm, type WorldSeedOptions } from '@/ui/setup/seed-form'
import { WorldPreview } from '@/ui/setup/preview'
import { deleteWorld } from '@/services/store'

type Step = 'seed' | 'preview' | 'creating'

export default function NewWorldPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>('seed')
  const [previewWorld, setPreviewWorld] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const [worldId, setWorldId] = React.useState<string | null>(null)
  const [seedPrompt, setSeedPrompt] = React.useState('')
  const [seedOptions, setSeedOptions] = React.useState<WorldSeedOptions | null>(null)

  const handleSeedSubmit = async (prompt: string, options: WorldSeedOptions) => {
    setSeedPrompt(prompt)
    setSeedOptions(options)
    setError('')

    const id = crypto.randomUUID()
    setWorldId(id)

    try {
      setStep('preview')
      const response = await fetch('/api/sim/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldPrompt: prompt,
          worldId: id,
          _generationHints: {
            style: options.style,
            maxRegions: options.maxRegions,
            maxOrganizations: options.maxOrganizations,
            maxCharacters: options.maxCharacters,
          },
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || '生成世界失败')
      }

      const data = await response.json()
      setPreviewWorld(data.world ?? data.world_snapshot ?? data)
      setStep('preview')
    } catch (err) {
      setError(String(err))
      setStep('seed')
    }
  }

  const handleConfirm = () => {
    if (worldId) {
      router.push(`/sim/${worldId}`)
    }
  }

  const handleRegenerate = () => {
    if (worldId) {
      deleteWorld(worldId).catch(() => {})
    }
    setPreviewWorld(null)
    setWorldId(null)
    setStep('seed')
  }

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Top bar */}
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <button
            onClick={() => {
              if (worldId && step !== 'creating') {
                deleteWorld(worldId).catch(() => {})
              }
              router.push('/sim')
            }}
            className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            返回世界列表
          </button>
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-300">创建新世界</span>
          </div>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/30 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {step === 'seed' && (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* Main: world description input */}
            <div>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-100">播种一个世界</h1>
                <p className="mt-1 text-sm text-slate-500">
                  写下你的世界构想，AI 会填充细节并让它自主运转。
                </p>
              </div>
              <WorldSeedForm onSubmit={handleSeedSubmit} isGenerating={false} />
            </div>

            {/* Sidebar: quick reference */}
            <div className="hidden lg:block">
              <div className="sticky top-8 space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    写什么
                  </h3>
                  <div className="mt-4 space-y-3">
                    {[
                      { label: '地点', text: '大陆、城市、秘境' },
                      { label: '人物', text: '英雄、暴君、阴谋家' },
                      { label: '矛盾', text: '战争、瘟疫、背叛' },
                      { label: '规则', text: '魔法体系、科技水平' },
                    ].map(tip => (
                      <div key={tip.label} className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-cyan-400">
                          {tip.label}
                        </span>
                        <span className="text-xs text-slate-500">{tip.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    试试这些
                  </h3>
                  <div className="mt-3 space-y-2">
                    {[
                      '一片被永夜笼罩的大陆，最后的火种掌握在三个互相猜忌的城邦手中',
                      '海底文明发现了一条通往地心的裂缝，沉睡万年的意志开始苏醒',
                      '一座不断向上生长的巨塔，每层都是独立的国度，越往上资源越匮乏',
                    ].map((example, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const textarea = document.querySelector('textarea')
                          if (textarea) {
                            textarea.value = example
                            textarea.dispatchEvent(new Event('input', { bubbles: true }))
                          }
                        }}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-left text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-300"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && previewWorld && (
          <div>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-100">世界预览</h1>
              <p className="mt-1 text-sm text-slate-500">
                检查生成结果，满意则进入世界，不满意可以重来。
              </p>
            </div>
            <WorldPreview
              world={previewWorld}
              onConfirm={handleConfirm}
              onRegenerate={handleRegenerate}
              isCreating={false}
            />
          </div>
        )}

        {step === 'preview' && !previewWorld && (
          <div className="flex flex-col items-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-sm text-slate-400">正在生成世界...</p>
            <p className="text-xs text-slate-600">这可能需要 1-3 分钟</p>
          </div>
        )}
      </div>
    </main>
  )
}
