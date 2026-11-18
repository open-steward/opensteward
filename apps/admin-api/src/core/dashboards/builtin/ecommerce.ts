import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const ECOMMERCE: BuiltinDashboard = {
  id: 'builtin:ecommerce',
  name: 'Ecommerce',
  description:
    'Orders, revenue, order value, customers and where the sales come from across your storefronts.',
  vertical: 'ecommerce',
  widgets: [
    w('ecommerce.orders_total', 'number', 4, undefined, true),
    w('ecommerce.revenue_total', 'number', 4, undefined, true),
    w('ecommerce.aov', 'number', 4, undefined, true),
    w('ecommerce.orders_per_day', 'line', 6),
    w('ecommerce.revenue_per_day', 'bar', 6),
    w('ecommerce.orders_by_financial_status', 'pie', 6),
    w('ecommerce.sales_by_gateway', 'donut', 6),
    w('ecommerce.revenue_composition', 'waterfall', 6),
    w('ecommerce.net_revenue', 'waterfall', 6),
    w('ecommerce.repeat_purchase_rate', 'gauge', 4),
    w('ecommerce.payment_failure_rate', 'gauge', 4),
    w('ecommerce.discount_rate', 'gauge', 4),
    w('ecommerce.new_customers_per_day', 'line', 6),
    w('ecommerce.orders_by_weekday_hour', 'heatmap', 6),
    w('ecommerce.orders_per_customer', 'bar', 6),
    w('ecommerce.catalog_by_status', 'donut', 6),
  ],
}

export const ECOMMERCE_OPERATIONS: BuiltinDashboard = {
  id: 'builtin:ecommerce-operations',
  name: 'Ecommerce operations',
  description:
    'Fulfilment backlog and speed, delivery, stock and the discount and shipping levers behind margin.',
  vertical: 'ecommerce',
  widgets: [
    w('ecommerce.unfulfilled_backlog', 'number', 4),
    w('ecommerce.unfulfilled_backlog_value', 'number', 4),
    w('ecommerce.late_delivery_rate', 'gauge', 4),
    w('ecommerce.stockouts', 'number', 3),
    w('ecommerce.low_stock', 'number', 3),
    w('ecommerce.fulfillment_ship_time', 'number', 3, 'Time to ship', true),
    w('ecommerce.time_to_deliver', 'number', 3, undefined, true),
    w('ecommerce.orders_by_fulfillment_status', 'donut', 6),
    w('ecommerce.unfulfilled_backlog_aging', 'bar', 6),
    w('ecommerce.unfulfilled_backlog_value_aging', 'bar', 6),
    w('ecommerce.fulfillments_by_carrier', 'hbar', 6),
    w('ecommerce.fulfillments_by_status', 'donut', 6),
    w('ecommerce.fulfillments_by_location', 'bar', 6),
    w('ecommerce.fulfillment_ship_time', 'histogram', 6, 'Time to ship spread'),
    w('ecommerce.time_to_deliver', 'boxplot', 6),
    w('ecommerce.discount_amount', 'number', 4, undefined, true),
    w('ecommerce.discounted_order_share', 'gauge', 4),
    w('ecommerce.shipping_share', 'gauge', 4),
    w('ecommerce.orders_by_discount_code', 'hbar', 6),
    w('ecommerce.shipping_total', 'bar', 6),
  ],
}

export const ECOMMERCE_RISK: BuiltinDashboard = {
  id: 'builtin:ecommerce-risk',
  name: 'Ecommerce risk',
  description:
    'Refunds, cancellations and fraud, customer concentration, discount dependency, payment failures and stuck orders.',
  vertical: 'ecommerce',
  widgets: [
    w('ecommerce.refund_rate_amount', 'gauge', 4),
    w('ecommerce.cancellation_rate', 'gauge', 4),
    w('ecommerce.customer_concentration', 'gauge', 4),
    w('ecommerce.discount_dependency', 'gauge', 4),
    w('ecommerce.payment_failure_rate', 'gauge', 4),
    w('ecommerce.late_delivery_rate', 'gauge', 4),
    w('ecommerce.stale_unpaid_orders', 'number', 3),
    w('ecommerce.unfulfilled_backlog_risk', 'number', 3),
    w('ecommerce.fraud_cancellations', 'number', 3, undefined, true),
    w('ecommerce.stockout_cancellations', 'number', 3, undefined, true),
    w('ecommerce.refund_and_cancel_leakage', 'waterfall', 6),
    w('ecommerce.cancellations_by_reason', 'hbar', 6),
    w('ecommerce.refund_amount_per_day', 'bar', 6),
    w('ecommerce.cancellations_per_day', 'bar', 6),
    w('ecommerce.customer_concentration', 'pareto', 6),
    w('ecommerce.currency_exposure', 'donut', 6),
    w('ecommerce.unfulfilled_backlog_risk_value', 'number', 4),
    w('ecommerce.voided_orders', 'number', 4, undefined, true),
    w('ecommerce.refund_rate_orders', 'gauge', 4),
    w('ecommerce.payment_failures_by_code', 'hbar', 6),
    w('ecommerce.cancellation_timing', 'histogram', 6),
  ],
}
