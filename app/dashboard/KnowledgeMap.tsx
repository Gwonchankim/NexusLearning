// Static, layered SVG of the prerequisite DAG (PR4). Server component — no
// interactivity. The map is for understanding state; the recommendation card is
// the single action entry point, so nodes are not clickable.

import type { NodeStatus } from '@/lib/graph'

interface MapConcept {
  id: string
  name: string
  orderIndex: number
  prereqIds: string[]
}

const NODE_W = 168
const NODE_H = 40
const X_GAP = 20
const Y_GAP = 44
const MARGIN = 16

const STATUS_STYLE: Record<NodeStatus, { fill: string; stroke: string; text: string }> = {
  locked: { fill: '#f3f4f6', stroke: '#d1d5db', text: '#9ca3af' },
  available: { fill: '#ffffff', stroke: '#3b82f6', text: '#1f2937' },
  in_progress: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a8a' },
  mastered: { fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff' },
}

export default function KnowledgeMap({
  concepts,
  statuses,
  recommendedId,
}: {
  concepts: MapConcept[]
  statuses: Record<string, NodeStatus>
  recommendedId: string | null
}) {
  if (concepts.length === 0) return null

  const byId = new Map(concepts.map((c) => [c.id, c]))

  // depth = longest path from a root; cycle-safe via a recursion-stack guard.
  const depthCache = new Map<string, number>()
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthCache.get(id)
    if (cached !== undefined) return cached
    if (stack.has(id)) return 0 // cycle guard
    const c = byId.get(id)
    if (!c || c.prereqIds.length === 0) {
      depthCache.set(id, 0)
      return 0
    }
    stack.add(id)
    let d = 0
    for (const p of c.prereqIds) {
      if (byId.has(p)) d = Math.max(d, depthOf(p, stack) + 1)
    }
    stack.delete(id)
    depthCache.set(id, d)
    return d
  }

  const rows = new Map<number, MapConcept[]>()
  let maxDepth = 0
  for (const c of concepts) {
    const d = depthOf(c.id, new Set())
    maxDepth = Math.max(maxDepth, d)
    const arr = rows.get(d) ?? []
    arr.push(c)
    rows.set(d, arr)
  }
  for (const arr of rows.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex)

  const rowWidth = (n: number) => n * NODE_W + (n - 1) * X_GAP
  const contentWidth = Math.max(...[...rows.values()].map((a) => rowWidth(a.length)))
  const width = contentWidth + MARGIN * 2
  const height = (maxDepth + 1) * (NODE_H + Y_GAP) - Y_GAP + MARGIN * 2

  const pos = new Map<string, { x: number; y: number }>()
  for (const [d, arr] of rows) {
    const startX = MARGIN + (contentWidth - rowWidth(arr.length)) / 2
    arr.forEach((c, i) => {
      pos.set(c.id, { x: startX + i * (NODE_W + X_GAP), y: MARGIN + d * (NODE_H + Y_GAP) })
    })
  }

  const truncate = (s: string) => (s.length > 11 ? `${s.slice(0, 10)}…` : s)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="지식맵: 개념 선수관계와 상태"
    >
      {concepts.flatMap((c) =>
        c.prereqIds
          .filter((p) => pos.has(p))
          .map((p) => {
            const from = pos.get(p)!
            const to = pos.get(c.id)!
            return (
              <line
                key={`${p}-${c.id}`}
                x1={from.x + NODE_W / 2}
                y1={from.y + NODE_H}
                x2={to.x + NODE_W / 2}
                y2={to.y}
                stroke="#e5e7eb"
                strokeWidth={1.5}
              />
            )
          }),
      )}
      {concepts.map((c) => {
        const p = pos.get(c.id)!
        const style = STATUS_STYLE[statuses[c.id] ?? 'locked']
        const isRec = c.id === recommendedId
        return (
          <g key={c.id}>
            <title>{c.name}</title>
            <rect
              x={p.x}
              y={p.y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={style.fill}
              stroke={isRec ? '#f59e0b' : style.stroke}
              strokeWidth={isRec ? 3 : 1.5}
            />
            <text
              x={p.x + NODE_W / 2}
              y={p.y + NODE_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fill={style.text}
            >
              {truncate(c.name)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
