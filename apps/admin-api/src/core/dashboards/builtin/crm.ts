import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const CRM: BuiltinDashboard = {
  id: 'builtin:crm',
  name: 'CRM',
  description:
    'Pipeline, win rate, deal flow, sales cycle and team activity across your CRM connections.',
  vertical: 'crm',
  widgets: [
    w('crm.pipeline_value_total', 'number', 4),
    w('crm.open_deals_total', 'number', 4),
    w('crm.win_rate', 'gauge', 4),
    w('crm.contacts_created_per_day', 'line', 6),
    w('crm.deals_by_stage', 'bar', 6),
    w('crm.pipeline_value_by_stage', 'bar', 6),
    w('crm.forecast_by_close_window', 'bar', 6),
    w('crm.deals_created_per_day', 'bar', 12),
    w('crm.won_value_per_month', 'bar', 6),
    w('crm.deals_won_per_month', 'bar', 6),
    w('crm.avg_deal_size', 'number', 4, undefined, true),
    w('crm.sales_cycle_length', 'number', 4, undefined, true),
    w('crm.activity_completion_rate', 'gauge', 4),
    w('crm.pipeline_by_owner', 'hbar', 6),
    w('crm.won_value_by_owner', 'pareto', 6),
    w('crm.activities_by_type', 'donut', 6),
    w('crm.activities_owner_by_type', 'heatmap', 6),
    w('crm.contacts_by_lifecycle_stage', 'donut', 6),
    w('crm.activities_per_week', 'stacked_bar', 6),
  ],
}

export const CRM_RISK: BuiltinDashboard = {
  id: 'builtin:crm-risk',
  name: 'CRM risk',
  description:
    'Pipeline concentration by deal, owner and company, coverage, stale and overdue deals, and missing owners, dates and values.',
  vertical: 'crm',
  widgets: [
    w('crm.pipeline_concentration', 'gauge', 4),
    w('crm.owner_concentration', 'gauge', 4),
    w('crm.customer_concentration', 'gauge', 4),
    w('crm.pipeline_company_concentration', 'gauge', 4),
    w('crm.pipeline_coverage', 'gauge', 4),
    w('crm.win_rate_trend', 'gauge', 4),
    w('crm.stale_deals', 'number', 4),
    w('crm.stale_deals_value', 'number', 4),
    w('crm.overdue_close_dates', 'number', 4),
    w('crm.deals_without_owner', 'number', 4),
    w('crm.deals_without_close_date', 'number', 4),
    w('crm.deals_without_value', 'number', 4),
    w('crm.deal_staleness', 'bar', 6),
    w('crm.overdue_close_value', 'bar', 6),
    w('crm.pipeline_concentration', 'pareto', 6),
    w('crm.owner_concentration', 'pareto', 6),
    w('crm.pipeline_company_concentration', 'treemap', 6),
    w('crm.customer_concentration', 'pareto', 6),
    w('crm.deal_age_by_stage', 'boxplot', 6),
    w('crm.win_rate_trend', 'line', 6),
    w('crm.overdue_activities', 'number', 4),
    w('crm.overdue_activities_by_owner', 'hbar', 8),
  ],
}
