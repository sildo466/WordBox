'use client'

import React from 'react'
import type { ConversationScene } from '@/core/sim/conversation'

type Props = {
  conversation: ConversationScene
  characters: Array<{ id: string; name: string }>
}

const ROLE_COLORS: Record<string, string> = {
  speaker: 'text-blue-300',
  listener: 'text-slate-400',
  narrator: 'text-yellow-300 italic',
}

export function ConversationViewer({ conversation, characters }: Props) {
  const [expanded, setExpanded] = React.useState(false)

  const charMap = new Map(characters.map(c => [c.id, c.name]))
  const lines = conversation.lines ?? []
  const displayLines = expanded ? lines : lines.slice(0, 4)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-slate-500">
          {conversation.participants?.map((p: any) => charMap.get(p.character_id) ?? p.character_id).join(' · ')}
        </span>
        {conversation.location_region_id && (
          <span className="ml-auto text-xs text-slate-600">📍 {conversation.location_region_id}</span>
        )}
      </div>

      {/* Lines */}
      <div className="space-y-1.5">
        {displayLines.map((line: any, i: number) => {
          const speakerName = charMap.get(line.speaker_id) ?? line.speaker_id ?? '旁白'
          const roleColor = ROLE_COLORS[line.role] ?? 'text-slate-300'
          return (
            <div key={i} className="text-xs">
              <span className={`font-medium ${roleColor}`}>{speakerName}：</span>
              <span className="text-slate-400">{line.text}</span>
            </div>
          )
        })}
      </div>

      {/* Expand/collapse */}
      {lines.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          {expanded ? '收起' : `展开全部 ${lines.length} 条`}
        </button>
      )}

      {/* Consequences */}
      {conversation.consequences?.length > 0 && expanded && (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <div className="text-xs text-slate-500">影响：</div>
          {conversation.consequences.map((c: any, i: number) => (
            <div key={i} className="mt-0.5 text-xs text-slate-400">· {c.description}</div>
          ))}
        </div>
      )}
    </div>
  )
}
