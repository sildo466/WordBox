'use client'

import React from 'react'
import { Play, Pause, SkipForward, Zap } from 'lucide-react'

type Props = {
  tick: number
  era_label?: string
  world_mood?: string
  isRunning: boolean
  isTicking: boolean
  onTick: () => void
  onToggleAuto: () => void
}

const MOOD_COLOR: Record<string, string> = {
  calm: 'text-green-400',
  tense: 'text-yellow-400',
  chaotic: 'text-red-400',
  hopeful: 'text-blue-400',
  grim: 'text-purple-400',
}

export function TickControlBar({ tick, era_label, world_mood = 'calm', isRunning, isTicking, onTick, onToggleAuto }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Zap className="h-4 w-4 text-yellow-400 shrink-0" />
        <span className="text-xs font-mono text-slate-300">
          Tick <span className="text-white font-bold">{tick}</span>
        </span>
        {era_label && (
          <span className="text-xs text-slate-500 hidden sm:inline">· {era_label}</span>
        )}
        {world_mood && (
          <span className={`text-xs font-medium hidden sm:inline ${MOOD_COLOR[world_mood] ?? 'text-slate-400'}`}>
            · {world_mood}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onTick}
          disabled={isTicking}
          title="单步推进"
          className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-40"
        >
          <SkipForward className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isTicking ? '推进中...' : '单步'}</span>
        </button>

        <button
          onClick={onToggleAuto}
          disabled={isTicking && !isRunning}
          title={isRunning ? '暂停' : '自动运行'}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            isRunning
              ? 'bg-red-700/60 text-red-200 hover:bg-red-700'
              : 'bg-green-700/60 text-green-200 hover:bg-green-700'
          } disabled:opacity-40`}
        >
          {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isRunning ? '暂停' : '自动'}</span>
        </button>
      </div>
    </div>
  )
}
