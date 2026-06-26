'use client'

import React from 'react'
import type { WorldSnapshot } from '@/core/world'
import type { Volume, Chapter, StorylineEvent, StorylinePreset, TimelineEntry } from '@/core/storyline'
import {
  BookTemplate,
  BookOpen,
  List,
  Play,
  CheckCircle2,
  Clock,
  X,
  ChevronDown,
  ChevronRight,
  SkipForward,
  Swords,
  Heart,
  Search,
  MapPin,
  Users,
  Sparkles,
  AlertTriangle,
  Star,
  RefreshCw,
  FileText,
  GitBranch,
} from 'lucide-react'

type StorylinePanelProps = {
  world: WorldSnapshot
}

export function StorylinePanel({ world }: StorylinePanelProps) {
  const [expandedVolumes, setExpandedVolumes] = React.useState<Set<number>>(new Set([0]))
  const [expandedChapters, setExpandedChapters] = React.useState<Set<string>>(new Set())
  const [selectedPresetIdx, setSelectedPresetIdx] = React.useState(0)
  const [viewMode, setViewMode] = React.useState<'volumes' | 'timeline'>('volumes')

  const preset = world.storyline_presets[selectedPresetIdx]
  const timeline = world.timeline

  const toggleVolume = (num: number) => {
    setExpandedVolumes((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num); else next.add(num)
      return next
    })
  }

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const statusIcon = (status: string) => {
    if (status === 'active') return <Play className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
    if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
    if (status === 'skipped') return <SkipForward className="h-3.5 w-3.5 text-slate-400" />
    return <Clock className="h-3.5 w-3.5 text-slate-300" />
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <BookTemplate className="h-4 w-4 text-blue-500" />
          Storyline
        </h3>
        {/* View toggle */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {(['volumes', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                viewMode === mode
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'volumes' ? (
                <><BookOpen className="h-3 w-3" /> Volumes</>
              ) : (
                <><List className="h-3 w-3" /> Timeline</>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {world.storyline_presets.length === 0 && timeline.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
          No storyline defined yet. Create a world with a narrative prompt first.
        </div>
      )}

      {/* Preset selector */}
      {world.storyline_presets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {world.storyline_presets.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelectedPresetIdx(i)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                i === selectedPresetIdx
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'volumes' && preset && <VolumesView preset={preset} expandedVolumes={expandedVolumes} expandedChapters={expandedChapters} onToggleVolume={toggleVolume} onToggleChapter={toggleChapter} statusIcon={statusIcon} />}
      {viewMode === 'timeline' && <TimelineView timeline={timeline} />}
    </div>
  )
}

/** Volumes view — shows volume/chapter/event structure */
function VolumesView({
  preset,
  expandedVolumes,
  expandedChapters,
  onToggleVolume,
  onToggleChapter,
  statusIcon,
}: {
  preset: StorylinePreset
  expandedVolumes: Set<number>
  expandedChapters: Set<string>
  onToggleVolume: (num: number) => void
  onToggleChapter: (id: string) => void
  statusIcon: (status: string) => React.ReactNode
}) {
  return (
    <div className="space-y-3">
      {/* Premise */}
      {preset.premise && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
            <FileText className="h-3 w-3" />
            Premise
          </div>
          <p className="text-sm text-slate-600 leading-relaxed italic">{preset.premise}</p>
        </div>
      )}

      {/* Volumes */}
      {preset.volumes.map((volume) => {
        const isExpanded = expandedVolumes.has(volume.volume_number)
        const completedChapters = volume.chapters.filter((ch) => ch.events.every((e) => e.trigger.type === 'tick_threshold')).length
        return (
          <div key={volume.volume_number} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Volume header */}
            <button
              onClick={() => onToggleVolume(volume.volume_number)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 shrink-0">
                {statusIcon(volume.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">Volume {volume.volume_number}</span>
                  {volume.title !== `Volume ${volume.volume_number}` && (
                    <span className="text-sm text-slate-500 truncate">— {volume.title}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                    volume.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                    volume.status === 'completed' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                    volume.status === 'skipped' ? 'bg-slate-100 text-slate-400 border border-slate-200' :
                    'bg-slate-50 text-slate-400 border border-slate-200'
                  }`}>
                    {volume.status}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {volume.chapters.length} chapters · {completedChapters}/{volume.chapters.length} events
                  </span>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                {/* Summary */}
                {volume.summary && (
                  <p className="text-xs text-slate-500 leading-relaxed">{volume.summary}</p>
                )}

                {/* Themes */}
                {volume.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {volume.themes.map((theme, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] text-violet-600">
                        <Sparkles className="h-2.5 w-2.5" />
                        {theme}
                      </span>
                    ))}
                  </div>
                )}

                {/* Key locations */}
                {volume.key_locations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {volume.key_locations.map((loc, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-600">
                        <MapPin className="h-2.5 w-2.5" />
                        {loc}
                      </span>
                    ))}
                  </div>
                )}

                {/* Central characters */}
                {volume.central_characters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {volume.central_characters.map((charId, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-600">
                        <Users className="h-2.5 w-2.5" />
                        {charId}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tick range */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  Estimated ticks: {volume.estimated_tick_range[0]} – {volume.estimated_tick_range[1]}
                </div>

                {/* Chapters */}
                {volume.chapters.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Chapters</div>
                    {volume.chapters.map((chapter) => (
                      <ChapterBlock
                        key={chapter.id}
                        chapter={chapter}
                        isExpanded={expandedChapters.has(chapter.id)}
                        onToggle={() => onToggleChapter(chapter.id)}
                        statusIcon={statusIcon}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Branches */}
      {preset.branches.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-3">
            <GitBranch className="h-3.5 w-3.5" />
            Branching Paths
          </div>
          <div className="space-y-2">
            {preset.branches.map((branch) => (
              <div key={branch.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-medium text-slate-700">{branch.description}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span>Leads to Volume {branch.target_volume_id}</span>
                  {branch.target_chapter_id && (
                    <><span>·</span><span>Chapter {branch.target_chapter_id}</span></>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Single chapter block inside a volume */
function ChapterBlock({
  chapter,
  isExpanded,
  onToggle,
  statusIcon,
}: {
  chapter: Chapter
  isExpanded: boolean
  onToggle: () => void
  statusIcon: (status: string) => React.ReactNode
}) {
  const completedEvents = chapter.events.filter((e) => e.trigger.type === 'tick_threshold').length

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Chapter header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 cursor-pointer"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-slate-700">{chapter.title}</span>
          {chapter.summary && (
            <span className="text-[10px] text-slate-400 ml-1.5 truncate">— {chapter.summary}</span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {chapter.events.length} events
        </span>
      </button>

      {/* Events */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
          {chapter.events.length === 0 && (
            <div className="py-2 text-center text-[10px] text-slate-400">No events defined</div>
          )}
          {chapter.events.map((event) => (
            <EventBlock key={event.id} event={event} statusIcon={statusIcon} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Single event inside a chapter */
function EventBlock({
  event,
  statusIcon,
}: {
  event: StorylineEvent
  statusIcon: (status: string) => React.ReactNode
}) {
  const typeIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      plot_point: <Star className="h-3 w-3 text-amber-500" />,
      conflict: <Swords className="h-3 w-3 text-red-500" />,
      revelation: <Sparkles className="h-3 w-3 text-violet-500" />,
      betrayal: <AlertTriangle className="h-3 w-3 text-red-500" />,
      battle: <Swords className="h-3 w-3 text-orange-500" />,
      alliance: <Heart className="h-3 w-3 text-emerald-500" />,
      climax: <Star className="h-3 w-3 text-red-500" />,
      character_death: <X className="h-3 w-3 text-slate-500" />,
      character_intro: <Users className="h-3 w-3 text-blue-500" />,
      discovery: <Search className="h-3 w-3 text-cyan-500" />,
      resolution: <CheckCircle2 className="h-3 w-3 text-blue-500" />,
    }
    return icons[type] || <FileText className="h-3 w-3 text-slate-400" />
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2">
      <div className="mt-0.5 shrink-0">{typeIcon(event.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700">{event.title}</span>
          {event.required && (
            <span className="text-[9px] text-amber-500 font-medium uppercase">Required</span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{event.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-slate-400 capitalize">{event.type.replace(/_/g, ' ')}</span>
          {event.involved_characters.length > 0 && (
            <span className="text-[9px] text-slate-400">
              {event.involved_characters.length} character{event.involved_characters.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      {event.fallback_to && event.fallback_to.length > 0 && (
        <div className="shrink-0" title={`Fallback: ${event.fallback_to.join(', ')}`}>
          <GitBranch className="h-3 w-3 text-amber-400" />
        </div>
      )}
    </div>
  )
}

/** Timeline view — shows all TimelineEntry records */
function TimelineView({ timeline }: { timeline: TimelineEntry[] }) {
  const [filter, setFilter] = React.useState<string | null>(null)

  const types = React.useMemo(() => {
    const set = new Set(timeline.map((e) => e.type))
    return Array.from(set)
  }, [timeline])

  const filtered = React.useMemo(() => {
    if (!filter) return timeline
    return timeline.filter((e) => e.type === filter)
  }, [timeline, filter])

  const typeConfig: Record<string, { label: string; dot: string }> = {
    volume_start: { label: 'Volume Start', dot: 'bg-emerald-500' },
    volume_end: { label: 'Volume End', dot: 'bg-blue-500' },
    chapter_start: { label: 'Chapter Start', dot: 'bg-violet-500' },
    chapter_end: { label: 'Chapter End', dot: 'bg-indigo-500' },
    event_triggered: { label: 'Event', dot: 'bg-amber-500' },
    character_event: { label: 'Character', dot: 'bg-cyan-500' },
    faction_event: { label: 'Faction', dot: 'bg-rose-500' },
    emergent_event: { label: 'Emergent', dot: 'bg-purple-500' },
    user_intervention: { label: 'User', dot: 'bg-blue-500' },
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all cursor-pointer ${
              !filter ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? null : type)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all cursor-pointer ${
                filter === type ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {typeConfig[type]?.label || type}
            </button>
          ))}
        </div>
      )}

      {timeline.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
          No timeline entries yet. Advance the world to see events recorded here.
        </div>
      )}

      {/* Timeline entries */}
      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-3">
          {filtered.map((entry) => {
            const cfg = typeConfig[entry.type] || { label: entry.type, dot: 'bg-slate-400' }
            return (
              <div key={entry.id} className="relative pl-12">
                {/* Dot */}
                <div className={`absolute left-[13px] top-[6px] h-3 w-3 rounded-full ring-2 ring-white ${cfg.dot}`} />

                {/* Card */}
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{entry.title}</span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{entry.description}</p>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className="text-[10px] text-slate-400">Tick {entry.tick}</span>

                        {entry.storyline_ref && (
                          <span className="text-[10px] text-slate-400">
                            Vol.{entry.storyline_ref.volume_number}
                            {entry.storyline_ref.chapter_id && <> · Ch.{entry.storyline_ref.chapter_id}</>}
                          </span>
                        )}

                        {entry.involved_characters.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {entry.involved_characters.length} character{entry.involved_characters.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Character tags */}
                      {entry.involved_characters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.involved_characters.slice(0, 5).map((charId) => (
                            <span key={charId} className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] text-slate-500">
                              {charId}
                            </span>
                          ))}
                          {entry.involved_characters.length > 5 && (
                            <span className="text-[9px] text-slate-400">+{entry.involved_characters.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Branch indicator */}
                    {entry.branch_id && (
                      <div className="shrink-0" title={`Branch: ${entry.branch_id}`}>
                        <GitBranch className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
                      {entry.tags.map((tag, i) => (
                        <span key={i} className="text-[9px] text-slate-400 bg-slate-50 rounded-full px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}