import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const OVERVIEW: BuiltinDashboard = {
  id: 'builtin:overview',
  name: 'System health',
  description:
    'How syncing is going: success rate, failures by platform and error type, stale connections, expiring tokens, data freshness and what the store holds.',
  vertical: null,
  widgets: [
    w('system.sync_success_rate', 'gauge', 4),
    w('system.sync_duration', 'number', 4, 'Typical sync duration'),
    w('system.connections_by_status', 'donut', 4),
    w('system.sync_outcomes_per_day', 'stacked_bar', 8, 'Sync outcomes per day'),
    w('system.stale_connections', 'donut', 4),
    w('system.sync_failures_by_platform', 'hbar', 6),
    w('system.sync_error_types', 'donut', 6),
    w('system.token_expiring_soon', 'table', 6),
    w('system.sync_duration', 'histogram', 6, 'Sync duration spread'),
    w('system.sync_success_rate', 'line', 12, 'Sync success rate over time'),
    w('system.records_per_vertical', 'bar', 6),
    w('system.records_per_resource', 'pareto', 6),
    w('system.data_freshness', 'table', 12),
  ],
}
