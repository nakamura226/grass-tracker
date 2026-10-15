import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GrassHistory } from '../types'

import { addDays, asUsage, compact, dateKey, dayTotal, hourTotal, leveler, pad, streaks } from './grass'
import type { Level } from './grass'

const history = atom({ plugin: 'grass-tracker', key: 'history' } as const, {} as GrassHistory)
const isLight = atom({ plugin: 'grass-tracker', key: 'isLight' } as const, false)

const PANE = 'grass'

const PALETTE = {
  dark: ['subtle', '#0e4429', '#006d32', '#26a641', '#39d353'],
  light: ['subtle', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
} as const

// neighbouring cells of one color become one Text to keep the tree small
const runs = (levels: Level[], colors: readonly string[], cell: string) => {
  const out: { color: string; text: string }[] = []
  for (const l of levels) {
    const color = colors[l]!
    const last = out[out.length - 1]
    if (last && last.color === color) last.text += cell
    else out.push({ color, text: cell })
  }
  return out
}

const WEEKDAY_LABELS = ['    ', 'Mon ', '    ', 'Wed ', '    ', 'Fri ', '    ']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function loadTheme($: EngineInterface) {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  const light = /light/i.test(String(row?.value ?? ''))
  await update($, isLight, () => light)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const path = `${await $.env.get('HOME')}/.claude/grass-history.json`
    const saved = await $.fs.read(path).then(t => JSON.parse(t) as GrassHistory).catch(() => null)
    if (saved) await update($, history, () => saved)
    await loadTheme($).catch(() => {})
    await $.command.register({ name: 'grass', description: 'Show token usage calendar and weekday × hour heatmap' })
    return next(e)
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    await loadTheme($).catch(() => {})
    return result
  })

  on('command.run', { command: 'grass' }, async $ => {
    await $.ui.open({ id: PANE, title: 'grass' })
    return {}
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = e.usage
    if (!usage) return result

    const io = usage.input_tokens + usage.output_tokens
    const cache = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
    const now = new Date(await $.clock.now())
    const day = dateKey(now)
    const hour = pad(now.getHours())

    const saved = await update($, history, h => {
      const prev = asUsage(h[day]?.[hour] ?? { io: 0, cache: 0 })
      return { ...h, [day]: { ...h[day], [hour]: { io: prev.io + io, cache: prev.cache + cache } } }
    })
    const path = `${await $.env.get('HOME')}/.claude/grass-history.json`
    await $.fs.write(path, JSON.stringify(saved, null, 2)).catch(() => {})
    return result
  })

  // one row above the prompt: the last 24 hours, one cell per hour, oldest left
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const saved = await read($, history)
    const colors = PALETTE[(await read($, isLight)) ? 'light' : 'dark']
    const now = new Date(await $.clock.now())

    const hours = Array.from({ length: 24 }, (_, i) => new Date(now.getTime() - (23 - i) * 3_600_000))
    const values = hours.map(d => hourTotal(saved, d, d.getHours()))

    // levels follow every recorded hour of the past year, so a quiet day reads as quiet
    const yearHours: number[] = []
    for (let d = addDays(now, -364); d <= now; d = addDays(d, 1)) {
      for (let hr = 0; hr < 24; hr++) yearHours.push(hourTotal(saved, d, hr))
    }
    const level = leveler(yearHours)
    const sum = values.reduce((a, b) => a + b, 0)

    return (
      <Box>
        {runs(values.map(level), colors, '■').map((r, i) => (
          <Text key={String(i)} color={r.color}>{r.text}</Text>
        ))}
        <Text dimColor> {compact(sum)} tokens</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const saved = await read($, history)
    const colors = PALETTE[(await read($, isLight)) ? 'light' : 'dark']
    const today = new Date(await $.clock.now())
    const width = e.props.bodyColumns

    // whole months, newest last, as many as fit the width in one block (no wrapping), up to 12;
    // every figure in the pane covers this same span
    const maxWeeks = Math.max(1, Math.floor((width - 4) / 2))
    const lastSunday = addDays(today, -today.getDay())
    const weeksFrom = (start: Date) => Math.round((lastSunday.getTime() - addDays(start, -start.getDay()).getTime()) / (7 * 86_400_000)) + 1
    let months = 12
    while (months > 1 && weeksFrom(new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)) > maxWeeks) months -= 1
    const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)
    const weeks = weeksFrom(start)
    const firstSunday = addDays(start, -start.getDay())

    const cal: (Date | null)[][] = Array.from({ length: 7 }, (_, wd) =>
      Array.from({ length: weeks }, (_, w) => {
        const d = addDays(firstSunday, w * 7 + wd)
        return d < start || d > today ? null : d
      }),
    )
    const calValues = cal.flat().filter((d): d is Date => d !== null).map(d => dayTotal(saved, d))
    const calLevel = leveler(calValues)

    let monthRow = '    '
    for (let w = 0; w < weeks; w++) {
      const d = addDays(firstSunday, w * 7 + 6)
      const isNewMonth = w === 0 || addDays(d, -7).getMonth() !== d.getMonth()
      if (monthRow.length <= 4 + w * 2 && isNewMonth) monthRow = monthRow.padEnd(4 + w * 2) + MONTHS[d.getMonth()]
    }

    const punch = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    for (let d = start; d <= today; d = addDays(d, 1)) {
      for (let hr = 0; hr < 24; hr++) punch[d.getDay()]![hr]! += hourTotal(saved, d, hr)
    }
    const punchLevel = leveler(punch.flat())
    // always starts at 0:00; late hours are dropped first when the pane is narrow
    const hoursShown = Math.max(1, Math.min(24, Math.floor((width - 4) / 2)))

    const { current, longest } = streaks(saved, today, start)
    const total = calValues.reduce((a, b) => a + b, 0)
    const span = months === 12 ? 'the last year' : months === 1 ? 'this month' : `the last ${months} months`

    // null cells before the span stay blank so the columns line up; nulls after today are dropped
    const row = (label: string, cells: (Level | null)[], key: string) => {
      const lead = cells.findIndex(c => c !== null)
      const levels = (lead < 0 ? [] : cells.slice(lead)).filter((c): c is Level => c !== null)
      return (
        <Box key={key}>
          <Text dimColor>{label}{'  '.repeat(Math.max(0, lead))}</Text>
          {runs(levels, colors, '■ ').map((r, i) => (
            <Text key={String(i)} color={r.color}>{r.text}</Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text>
          {compact(total)} tokens in {span} · current streak {current}d · longest {longest}d
        </Text>
        <Text> </Text>
        <Text dimColor>{monthRow}</Text>
        {cal.map((week, wd) => row(WEEKDAY_LABELS[wd]!, week.map(d => (d ? calLevel(dayTotal(saved, d)) : null)), `c${wd}`))}
        <Text> </Text>
        <Text dimColor>{'    0     3     6     9     12    15    18    21'.slice(0, 4 + hoursShown * 2).trimEnd()}</Text>
        {punch.map((hours, wd) => row(WEEKDAY_LABELS[wd]!, hours.slice(0, hoursShown).map(punchLevel), `p${wd}`))}
        <Text> </Text>
        <Box>
          <Text dimColor>Less </Text>
          {runs([0, 1, 2, 3, 4], colors, '■ ').map((r, i) => (
            <Text key={String(i)} color={r.color}>{r.text}</Text>
          ))}
          <Text dimColor>More · Esc to close</Text>
        </Box>
      </Box>
    )
  })
}
