import type { DashboardWidget } from '../../db/dashboard-store'

/** A dashboard defined in code: read-only, visible to every `dashboards:view` holder. */
export interface BuiltinDashboard {
  /** `builtin:<slug>` — never collides with a stored `dsh_…` id. */
  id: `builtin:${string}`
  name: string
  description: string
  /** The vertical it is about, or null for the cross-vertical overview. */
  vertical: string | null
  widgets: DashboardWidget[]
}
