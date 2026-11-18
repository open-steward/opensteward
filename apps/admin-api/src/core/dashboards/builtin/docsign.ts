import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const DOCSIGN: BuiltinDashboard = {
  id: 'builtin:docsign',
  name: 'Document signing',
  description:
    'Envelopes sent, completed and declined, how long signing takes, and which templates and senders drive it.',
  vertical: 'docsign',
  widgets: [
    w('docsign.in_flight', 'number', 3),
    w('docsign.completion_rate', 'gauge', 3),
    w('docsign.decline_rate', 'gauge', 3),
    w('docsign.time_to_complete', 'number', 3, undefined, true),
    w('docsign.outcomes_per_day', 'stacked_bar', 12),
    w('docsign.envelopes_sent_per_day', 'bar', 6),
    w('docsign.envelopes_completed_per_day', 'bar', 6),
    w('docsign.envelopes_by_status', 'funnel', 6),
    w('docsign.pending_by_age', 'bar', 6),
    w('docsign.time_to_complete', 'histogram', 6),
    w('docsign.time_to_first_view', 'histogram', 6),
    w('docsign.time_to_complete_by_template', 'boxplot', 6),
    w('docsign.envelopes_by_template', 'pareto', 6),
    w('docsign.envelopes_by_sender', 'hbar', 8),
    w('docsign.templates_used', 'gauge', 4),
  ],
}

export const DOCSIGN_RISK: BuiltinDashboard = {
  id: 'builtin:docsign-risk',
  name: 'Document signing risk',
  description:
    'Stuck envelopes, stale drafts, expiries, decline and void rates, and dependence on a few senders.',
  vertical: 'docsign',
  widgets: [
    w('docsign.stuck', 'number', 3),
    w('docsign.stale_drafts', 'number', 3),
    w('docsign.decline_rate', 'gauge', 3),
    w('docsign.voided_expired_rate', 'gauge', 3),
    w('docsign.sender_concentration', 'gauge', 4),
    w('docsign.completion_rate', 'gauge', 4),
    w('docsign.time_to_complete', 'number', 4, undefined, true),
    w('docsign.expiring_soon', 'bar', 6),
    w('docsign.pending_by_age', 'bar', 6),
    w('docsign.decline_rate_trend', 'line', 6),
    w('docsign.voided_expired_rate', 'line', 6),
    w('docsign.sender_concentration', 'pareto', 6),
    w('docsign.envelopes_declined_per_day', 'bar', 6),
    w('docsign.envelopes_voided_per_day', 'bar', 8),
    w('docsign.in_flight', 'number', 4),
  ],
}
