export const metadata = {
  platform: 'shipbob-inventory',
  totalResources: 7,
  availableResources: ['product', 'stock-level', 'location', 'purchase-order'],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'ShipBob is a third-party logistics provider: it warehouses and ships the merchant\'s stock but models no procurement. The 2026-01 API exposes no supplier resource, and a warehouse receiving order names no supplier either.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'ShipBob moves stock between its own fulfillment centers internally and exposes no transfer resource to create, list or read one. Per-location quantities include an internal_transfer_quantity field, but that is a balance, not a transfer record.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        "ShipBob exposes no adjustment resource: the 2026-01 OpenAPI document has 69 paths and none matches /adjust/. The nearest thing is POST /2026-01/inventory/history:query, and it is not a substitute for three reasons. It is a feed of EVERY stock movement — the endpoint's own description lists 'receiving/stow, order picks, adjustments, restocks, and attribute updates' — so emitting it wholesale would report every order pick as a stock adjustment. Isolating the adjustments would mean filtering on event_category, which the document types as a bare string with no enum, so the values that mean 'adjustment' are not knowable from the spec. And an event carries inventory_id but no facility, while a canonical StockAdjustment requires locationId. (Individual events do carry an inventory_audit_event_id, so the obstacle is the feed's meaning rather than a missing identifier.)",
    },
  ],
} as const
