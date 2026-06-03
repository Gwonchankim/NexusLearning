// Static SVG line chart of the last 30 days of daily average mastery (from
// growth_snapshots). Server component — no interactivity, no dependency.
// Y axis is a fixed 0..1 mastery scale; X axis spaces the points evenly.

export default function GrowthCurve({ curve }: { curve: { date: string; masteryAvg: number }[] }) {
  if (curve.length < 2) return null
  const W = 240
  const H = 80
  const pad = 6
  const innerW = W - pad * 2
  const innerH = H - pad * 2
  const n = curve.length
  const xAt = (i: number) => pad + (innerW * i) / (n - 1)
  const yAt = (m: number) => pad + innerH - innerH * Math.min(1, Math.max(0, m))

  const line = curve.map((d, i) => `${xAt(i)},${yAt(d.masteryAvg)}`).join(' ')
  const area = `${xAt(0)},${pad + innerH} ${line} ${xAt(n - 1)},${pad + innerH}`
  const last = curve[n - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-20 w-full"
      role="img"
      aria-label={`최근 30일 성장 추이, 현재 평균 숙련도 ${Math.round(last.masteryAvg * 100)}%`}
    >
      <polygon points={area} className="fill-blue-100" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-blue-500"
      />
      <circle cx={xAt(n - 1)} cy={yAt(last.masteryAvg)} r={2.5} className="fill-blue-600" />
    </svg>
  )
}
