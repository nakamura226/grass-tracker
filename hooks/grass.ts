import type { GrassHistory, HourUsage } from '../types'

export type Level = 0 | 1 | 2 | 3 | 4

export const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// older files stored a bare number per hour
export const asUsage = (v: HourUsage | number): HourUsage => (typeof v === 'number' ? { io: v, cache: 0 } : v)
export const tokens = (v: HourUsage | number | undefined) => (v === undefined ? 0 : asUsage(v).io + asUsage(v).cache)

export const hourTotal = (h: GrassHistory, d: Date, hour: number) => tokens(h[dateKey(d)]?.[pad(hour)])
export const dayTotal = (h: GrassHistory, d: Date) =>
  Object.values(h[dateKey(d)] ?? {}).reduce((s, v) => s + tokens(v), 0)

export const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  return sorted[lo]! + (sorted[Math.ceil(pos)]! - sorted[lo]!) * (pos - lo)
}

// GitHub-style: thresholds are the quartiles of the non-zero values, so one huge day
// does not wash the rest out; with fewer than four samples, fall back to a share of the max
export const leveler = (values: number[]) => {
  const nonZero = values.filter(v => v > 0).sort((a, b) => a - b)
  if (nonZero.length < 4) {
    const max = nonZero[nonZero.length - 1] ?? 0
    return (v: number): Level => (v <= 0 ? 0 : (Math.min(4, Math.ceil((v / max) * 4)) as Level))
  }
  const [q1, q2, q3] = [0.25, 0.5, 0.75].map(q => quantile(nonZero, q)) as [number, number, number]
  return (v: number): Level => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4)
}

export const streaks = (h: GrassHistory, today: Date, from: Date) => {
  const days = Object.keys(h)
    .filter(k => k >= dateKey(from) && Object.values(h[k]!).some(v => tokens(v) > 0))
    .sort()
  const active = new Set(days)
  let longest = 0
  let run = 0
  let prev: string | undefined
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number)
    run = prev === dateKey(addDays(new Date(y!, m! - 1, d!), -1)) ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }
  let current = 0
  let d = active.has(dateKey(today)) ? today : addDays(today, -1)
  while (active.has(dateKey(d))) {
    current += 1
    d = addDays(d, -1)
  }
  return { current, longest }
}

export const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)
