import type { DashboardChart, DashboardWidget } from '../../db/dashboard-store'

/**
 * One widget. `compare` is set on number widgets of comparable metrics only
 * (the consistency test enforces both directions). `currency` and
 * `granularity` stay unset so a viewer's filters apply.
 */
export function w(
  metricId: string,
  chart: DashboardChart,
  width: number,
  title?: string,
  compare?: boolean,
): DashboardWidget {
  const widget: DashboardWidget = { metricId, chart, width }
  if (title !== undefined) widget.title = title
  if (compare === true) widget.compare = true
  return widget
}
