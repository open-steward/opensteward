export const metadata = {
  platform: 'odoo-inventory',
  totalResources: 7,
  availableResources: ['product', 'stock-level', 'location', 'purchase-order', 'stock-transfer'],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'Odoo has no supplier model: a vendor is a res.partner, the same model as every contact, and this adapter reads only the product, stock and purchase models.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Odoo has no stock-adjustment model: a count is the stock.quant field inventory_quantity ("Counted") applied by action_apply_inventory as stock.move rows flagged is_inventory, with no adjustment document to read back (addons/stock, 19.0).',
    },
  ],
} as const
