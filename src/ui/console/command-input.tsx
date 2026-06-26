'use client'

import React from 'react'
import { Send, Target, Zap, ChevronDown, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import type { GodCommand } from '@/core/sim/command'
import type { WorldSnapshot } from '@/core/world'

type Props = {
  world: WorldSnapshot
  onCommand: (raw_input: string) => Promise<void>
  isSubmitting: boolean
}

const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock,
  parsed: Clock,
  executing: Loader2,
  completed: CheckCircle,
  refused: XCircle,
  failed: XCircle,
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-slate-400',
  parsed: 'text-blue-400',
  executing: 'text-yellow-400',
  completed: 'text-green-400',
  refused: 'text-red-400',
  failed: 'text-red-500',
}

const QUICK_COMMANDS = [
  '让最强大的角色去探索未知区域',
  '在最混乱的地区引发一场政治危机',
  '命令主角势力与最强敌人谈判',
  '让所有组织重新评估彼此关系',
]

export function GodCommandPanel({ world, onCommand, isSubmitting }: Props) {
  const [input, setInput] = React.useState('')
  const [showHistory, setShowHistory] = React.useState(true)

  const commands: GodCommand[] = (world as any).god_commands ?? []
  const recent = [...commands].reverse().slice(0, 10)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSubmitting) return
    await onCommand(input.trim())
    setInput('')
  }

  const handleQuick = async (cmd: string) => {
    if (isSubmitting) return
    await onCommand(cmd)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Zap className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-medium text-slate-200">神命令</span>
        {commands.length > 0 && (
          <span className="ml-auto rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {commands.length}
          </span>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-b border-slate-700 p-3 space-y-2">
        <div className="relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as any)
              }
            }}
            placeholder="向角色、组织或地区发出命令..."
            rows={3}
            disabled={isSubmitting}
            className="w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Target className="h-3 w-3" />
            <span>Enter发送 · Shift+Enter换行</span>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !input.trim()}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-purple-600 disabled:opacity-40"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            发送
          </button>
        </div>
      </form>

      {/* Quick commands */}
      <div className="border-b border-slate-700 p-3">
        <p className="mb-2 text-xs text-slate-600">快捷命令</p>
        <div className="space-y-1">
          {QUICK_COMMANDS.map(cmd => (
            <button
              key={cmd}
              onClick={() => handleQuick(cmd)}
              disabled={isSubmitting}
              className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200 disabled:opacity-40"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Command history */}
      <div className="flex-1 overflow-hidden">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-slate-300 transition"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          命令历史 ({commands.length})
        </button>

        {showHistory && (
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 36px)' }}>
            {recent.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-600 text-center">暂无命令历史</p>
            ) : (
              <div className="divide-y divide-slate-800 px-3">
                {recent.map(cmd => {
                  const Icon = STATUS_ICON[cmd.status] ?? Clock
                  return (
                    <div key={cmd.id} className="py-2">
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[cmd.status] ?? 'text-slate-400'} ${cmd.status === 'executing' ? 'animate-spin' : ''}`} />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-300 leading-relaxed">{cmd.raw_input}</p>
                          {cmd.parsed_intent && (
                            <p className="mt-0.5 text-xs text-slate-500">{cmd.parsed_intent}</p>
                          )}
                          {cmd.feedback && (
                            <p className="mt-0.5 text-xs text-green-500/80">{cmd.feedback}</p>
                          )}
                          {cmd.refusal_reason && (
                            <p className="mt-0.5 text-xs text-red-400/80">{cmd.refusal_reason}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-slate-700">t{cmd.issued_at_tick}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500">{cmd.status}</span>
                            {cmd.target_name && (
                              <span className="rounded bg-purple-950/50 px-1.5 py-0.5 text-xs text-purple-400">{cmd.target_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
