export type HourUsage = { io: number; cache: number }
export type GrassHistory = Record<string, Record<string, HourUsage>>

declare module 'claude-code' {
  interface PluginState {
    'grass-tracker': { history: GrassHistory; isLight: boolean }
  }
}
