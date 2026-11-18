import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const ACCOUNTING: BuiltinDashboard = {
  id: 'builtin:accounting',
  name: 'Accounting',
  description:
    'Revenue, what is outstanding, expenses, cash movement and tax: the financial picture across your accounting connections.',
  vertical: 'accounting',
  widgets: [
    w('accounting.revenue', 'number', 4, 'Revenue', true),
    w('accounting.outstanding_amount', 'number', 4),
    w('accounting.avg_invoice_value', 'number', 4, undefined, true),
    w('accounting.revenue_per_month', 'bar', 6),
    w('accounting.invoiced_vs_collected', 'waterfall', 6),
    w('accounting.invoices_by_status', 'pie', 6),
    w('accounting.document_mix', 'hbar', 6),
    w('accounting.invoices_issued_per_day', 'bar', 12),
    w('accounting.expenses', 'waterfall', 6),
    w('accounting.expenses_by_account', 'pareto', 6),
    w('accounting.cash_in_per_month', 'bar', 6),
    w('accounting.cash_out_per_month', 'bar', 6),
    w('accounting.net_cash_flow', 'waterfall', 6),
    w('accounting.net_tax_position', 'waterfall', 6),
  ],
}

export const ACCOUNTING_AR_AP: BuiltinDashboard = {
  id: 'builtin:accounting-ar-ap',
  name: 'Receivables and payables',
  description:
    'Who owes you and whom you owe: DSO and DPO, aging, overdue balances, bills falling due and how fast invoices get paid.',
  vertical: 'accounting',
  widgets: [
    // Days outstanding, both ways, and the cycle between them.
    w('accounting.dso', 'gauge', 4),
    w('accounting.dpo', 'gauge', 4),
    w('accounting.cash_conversion_cycle', 'gauge', 4),
    w('accounting.ar_balance', 'number', 4, 'Receivables'),
    w('accounting.ap_balance', 'number', 4, 'Payables'),
    w('accounting.open_invoice_count', 'number', 4),
    w('accounting.overdue_amount', 'number', 6, 'Overdue receivables'),
    w('accounting.ap_overdue_amount', 'number', 6, 'Overdue payables'),
    // Each side's aging beside the number that summarises it.
    w('accounting.overdue_pct', 'gauge', 4),
    w('accounting.ar_aging', 'bar', 8),
    w('accounting.bills_due_next_7d', 'number', 4),
    w('accounting.ap_aging', 'bar', 8),
    w('accounting.bills_due_schedule', 'bar', 6),
    w('accounting.top_open_invoices', 'hbar', 6),
    w('accounting.avg_days_to_pay', 'number', 3, 'Days to get paid', true),
    w('accounting.avg_days_beyond_terms', 'number', 3, 'Days past terms', true),
    w('accounting.avg_days_to_pay_suppliers', 'number', 3, 'Days to pay suppliers', true),
    w('accounting.on_time_payment_rate', 'gauge', 3),
    w('accounting.days_to_pay_distribution', 'histogram', 6),
    w('accounting.bills_by_status', 'donut', 6),
    w('accounting.top_expense_suppliers', 'hbar', 6),
    w('accounting.late_payment_trend', 'line', 6),
  ],
}

export const ACCOUNTING_RISK: BuiltinDashboard = {
  id: 'builtin:accounting-risk',
  name: 'Accounting risk',
  description:
    'Concentration on customers and suppliers, overdue exposure, DSO and DPO, credit notes, voids and gaps in the invoice data.',
  vertical: 'accounting',
  widgets: [
    w('accounting.customer_concentration', 'gauge', 4),
    w('accounting.supplier_concentration', 'gauge', 4),
    w('accounting.overdue_pct', 'gauge', 4),
    w('accounting.dso', 'gauge', 4),
    w('accounting.dpo', 'gauge', 4),
    w('accounting.credit_note_ratio', 'gauge', 4),
    w('accounting.overdue_amount', 'number', 4, 'Overdue receivables'),
    w('accounting.voided_invoices', 'number', 4, undefined, true),
    w('accounting.missing_due_date_rate', 'gauge', 4),
    w('accounting.refund_rate', 'gauge', 4),
    w('accounting.data_coverage', 'gauge', 4),
    w('accounting.avg_days_beyond_terms', 'number', 4, 'Days past terms', true),
    w('accounting.overdue_exposure_by_customer', 'pareto', 8),
    w('accounting.currency_exposure', 'donut', 4),
    w('accounting.customer_concentration', 'pareto', 6),
    w('accounting.supplier_concentration', 'pareto', 6),
    w('accounting.late_payment_trend', 'line', 6),
    w('accounting.ar_aging', 'bar', 6),
    w('accounting.ap_aging', 'bar', 6),
    w('accounting.voided_invoice_rate', 'line', 6),
  ],
}
