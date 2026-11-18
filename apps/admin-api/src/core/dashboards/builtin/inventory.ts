import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const INVENTORY: BuiltinDashboard = {
  id: 'builtin:inventory',
  name: 'Inventory',
  description:
    'Stock levels and where they sit, stock-outs, adjustments and transfers, and purchasing: orders, spend, suppliers and lead times.',
  vertical: 'inventory',
  widgets: [
    w('inventory.skus_active', 'number', 3),
    w('inventory.units_on_hand', 'number', 3),
    w('inventory.units_available', 'number', 3),
    w('inventory.units_committed', 'number', 3),
    w('inventory.units_incoming', 'number', 3),
    w('inventory.stockouts', 'number', 3),
    w('inventory.low_stock', 'number', 3),
    w('inventory.open_pos', 'number', 3),
    w('inventory.units_by_location', 'treemap', 12),
    w('inventory.adjustments_per_day', 'bar', 6),
    w('inventory.adjustments_by_reason', 'donut', 6),
    w('inventory.transfers_by_status', 'bar', 6),
    w('inventory.transfer_lead_time', 'histogram', 6),
    w('inventory.po_by_status', 'funnel', 6),
    w('inventory.po_spend_per_day', 'bar', 6),
    w('inventory.po_spend', 'number', 4, undefined, true),
    w('inventory.open_po_value', 'number', 4),
    w('inventory.po_on_time_receipt', 'gauge', 4),
    w('inventory.po_spend_by_supplier', 'pareto', 6),
    w('inventory.supplier_lead_time', 'boxplot', 6),
  ],
}

export const INVENTORY_RISK: BuiltinDashboard = {
  id: 'builtin:inventory-risk',
  name: 'Inventory risk',
  description:
    'Supplier and location concentration, late purchase orders, negative and uncounted stock, shrinkage, stock-outs and stuck transfers.',
  vertical: 'inventory',
  widgets: [
    w('inventory.supplier_concentration', 'gauge', 4),
    w('inventory.supplier_concentration_orders', 'gauge', 4),
    w('inventory.location_concentration', 'gauge', 4),
    w('inventory.late_po_exposure', 'gauge', 4),
    w('inventory.shrinkage_share', 'gauge', 4),
    w('inventory.po_on_time_receipt', 'gauge', 4),
    // Stock position: below zero, owed to customers, more than will sell.
    w('inventory.negative_stock', 'number', 3),
    w('inventory.negative_available', 'number', 3),
    w('inventory.backorder_exposure', 'number', 3),
    w('inventory.overstock_proxy', 'number', 3),
    // Purchasing and movement that have stalled.
    w('inventory.overdue_po_value', 'number', 4),
    w('inventory.overdue_pos', 'number', 4),
    w('inventory.transfers_stuck', 'number', 4),
    w('inventory.supplier_concentration', 'pareto', 6),
    w('inventory.location_concentration', 'pareto', 6),
    w('inventory.overdue_pos_by_age', 'bar', 6),
    w('inventory.overdue_pos_by_supplier', 'hbar', 6),
    w('inventory.open_pos_by_expected_date', 'bar', 12),
    w('inventory.stale_counts', 'number', 4),
    w('inventory.count_freshness', 'bar', 8),
    w('inventory.stockouts_by_location', 'hbar', 6),
    w('inventory.low_stock_by_location', 'hbar', 6),
  ],
}
