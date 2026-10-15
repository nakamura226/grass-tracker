# grass-tracker

A Claude Code mod that shows your token usage as a GitHub-style contribution grid ("草").

- **Above the prompt**: one row for the last 24 hours, one cell per hour, with the 24-hour total.
- **`/grass`**: a pane with the calendar (whole months that fit the width, up to a year), a weekday × hour heatmap, the total, and current / longest streaks. Esc closes it.

Each finished turn adds its tokens (input, output, and prompt-cache reads and writes) to `~/.claude/grass-history.json`, by date and hour. Only sessions with the mod installed are counted.

Levels follow GitHub's approach: quartiles of your own non-zero values, so one heavy day does not wash out the rest. Colors switch between GitHub's dark and light palettes with your Claude Code theme.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install grass-tracker --marketplace nakamura226/grass-tracker
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

From a shell:

```
claude plugin install grass-tracker --marketplace nakamura226/grass-tracker
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nakamura226/grass-tracker`, then Add plugin.

## Notes

- The VS Code extension does not draw mod UI yet; use Claude Code in a terminal (the VS Code integrated terminal works).
- Data stays on your machine in `~/.claude/grass-history.json`. Delete that file to reset.

## License

MIT
