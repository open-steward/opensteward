import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const SUPPORT: BuiltinDashboard = {
  id: 'builtin:support',
  name: 'Support',
  description:
    'Ticket volume and mix, backlog, resolution time and customer satisfaction across your helpdesks.',
  vertical: 'customer-support',
  widgets: [
    w('customer-support.open_tickets_now', 'number', 3),
    w('customer-support.resolution_time', 'number', 3, undefined, true),
    w('customer-support.csat_percent', 'gauge', 3),
    w('customer-support.csat_score', 'number', 3, undefined, true),
    w('customer-support.tickets_created_per_day', 'line', 6),
    w('customer-support.tickets_solved_per_day', 'line', 6),
    w('customer-support.tickets_by_status', 'pie', 6),
    w('customer-support.tickets_by_channel', 'donut', 6),
    w('customer-support.tickets_by_priority', 'bar', 6),
    w('customer-support.backlog_change', 'waterfall', 6),
    w('customer-support.volume_heatmap', 'heatmap', 12),
    w('customer-support.csat_trend', 'line', 6),
    w('customer-support.resolution_time', 'histogram', 6),
    w('customer-support.tickets_by_team', 'hbar', 6),
    w('customer-support.tickets_by_tag', 'pareto', 6),
    w('customer-support.tickets_by_channel_over_time', 'stacked_area', 12),
  ],
}

export const SUPPORT_RISK: BuiltinDashboard = {
  id: 'builtin:support-risk',
  name: 'Support risk',
  description:
    'Unassigned and urgent tickets, ageing and stuck queues, low ratings, and dependence on a few requesters or agents.',
  vertical: 'customer-support',
  widgets: [
    w('customer-support.unassigned_share', 'gauge', 3),
    w('customer-support.urgent_share', 'gauge', 3),
    w('customer-support.detractor_share', 'gauge', 3),
    w('customer-support.customer_concentration', 'gauge', 3),
    w('customer-support.open_over_7_days', 'number', 3),
    w('customer-support.unassigned_tickets', 'number', 3),
    w('customer-support.open_urgent_tickets', 'number', 3),
    w('customer-support.open_tickets_now', 'number', 3),
    w('customer-support.aging_open_tickets', 'bar', 6),
    w('customer-support.stale_open_tickets', 'bar', 6),
    w('customer-support.stuck_pending_hold', 'bar', 6),
    w('customer-support.unassigned_by_priority', 'bar', 6),
    w('customer-support.customer_concentration', 'pareto', 6),
    w('customer-support.agent_concentration', 'gauge', 6),
    w('customer-support.resolution_time_by_priority', 'boxplot', 6),
    w('customer-support.csat_by_channel', 'bar', 6),
    w('customer-support.detractor_share', 'line', 6),
    w('customer-support.csat_trend', 'line', 6),
    w('customer-support.open_tickets_by_team', 'hbar', 6),
    w('customer-support.open_tickets_by_status', 'donut', 6),
  ],
}
