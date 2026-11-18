import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const LOGISTICS: BuiltinDashboard = {
  id: 'builtin:logistics',
  name: 'Logistics',
  description:
    'Shipment volume, on-time delivery, exceptions, transit times, carrier mix and shipping spend.',
  vertical: 'logistics',
  widgets: [
    w('logistics.shipments_total', 'number', 3, undefined, true),
    w('logistics.on_time_rate', 'gauge', 3),
    w('logistics.exception_rate', 'gauge', 3),
    w('logistics.avg_transit_days', 'number', 3, undefined, true),
    w('logistics.shipments_per_day', 'bar', 6),
    w('logistics.late_shipments_per_day', 'bar', 6),
    w('logistics.shipments_by_status', 'funnel', 6),
    w('logistics.shipments_by_carrier', 'donut', 6),
    w('logistics.carrier_daily_volume', 'stacked_area', 12),
    w('logistics.shipping_spend', 'number', 4, undefined, true),
    w('logistics.cost_per_shipment', 'number', 4, undefined, true),
    w('logistics.returns_rate', 'gauge', 4),
    w('logistics.spend_per_day', 'line', 6),
    w('logistics.cost_by_carrier', 'hbar', 6),
    w('logistics.transit_by_carrier', 'boxplot', 6),
    w('logistics.transit_histogram', 'histogram', 6),
    w('logistics.shipping_volume_heatmap', 'heatmap', 8),
    w('logistics.shipments_in_flight', 'number', 4),
    w('logistics.shipments_by_service', 'hbar', 6),
    w('logistics.delivery_vs_promise', 'histogram', 6),
  ],
}

export const LOGISTICS_RISK: BuiltinDashboard = {
  id: 'builtin:logistics-risk',
  name: 'Logistics risk',
  description:
    'Carrier concentration by shipments and spend, stuck and lost shipments, late-delivery trend, label leakage and tracking data gaps.',
  vertical: 'logistics',
  widgets: [
    w('logistics.carrier_concentration_shipments', 'gauge', 4),
    w('logistics.carrier_concentration_spend', 'gauge', 4),
    w('logistics.exception_rate', 'gauge', 4),
    w('logistics.stuck_in_transit', 'number', 4),
    w('logistics.lost_shipments', 'number', 4),
    w('logistics.label_leakage_spend', 'number', 4, undefined, true),
    w('logistics.missing_eta_rate', 'gauge', 3),
    w('logistics.missing_carrier_rate', 'gauge', 3),
    w('logistics.unknown_status_rate', 'gauge', 3),
    w('logistics.delivered_without_date_rate', 'gauge', 3),
    w('logistics.stuck_by_age', 'bar', 6),
    w('logistics.stuck_by_carrier', 'hbar', 6),
    w('logistics.carrier_concentration_shipments', 'pareto', 6),
    w('logistics.carrier_concentration_spend', 'pareto', 6),
    w('logistics.late_delivery_trend', 'line', 6),
    w('logistics.late_deliveries_by_carrier', 'hbar', 6),
    w('logistics.exceptions_by_carrier', 'hbar', 6),
    w('logistics.exceptions_per_day', 'bar', 6),
    w('logistics.returns_rate', 'line', 6),
    w('logistics.label_leakage_rate', 'line', 6),
  ],
}
