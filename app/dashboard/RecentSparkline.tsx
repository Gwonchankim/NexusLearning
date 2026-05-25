// Static SVG sparkline of recent completed-session growth deltas (PR5).
// Server component — no interactivity, no dependency.

export default function RecentSparkline({ recent }: { recent: { date: string; delta: number }[] }) {
  if (recent.length < 2) return null
  const W = 240
  const H = 40
  const gap = 4
  const n = recent.length
  const barW = (W - gap * (n - 1)) / n
  const max = Math.max(0.05, ...recent.map((r) => Math.abs(r.delta)))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" role="img" aria-label="최근 세션 성장 변화">
      {recent.map((r, i) => {
        const h = Math.max(2, (Math.abs(r.delta) / max) * (H - 4))
        const x = i * (barW + gap)
        return (
          <rect
            key={`${r.date}-${i}`}
            x={x}
            y={H - h}
            width={barW}
            height={h}
            rx={1}
            className={r.delta > 0 ? 'fill-blue-500' : 'fill-gray-300'}
          />
        )
      })}
    </svg>
  )
}
