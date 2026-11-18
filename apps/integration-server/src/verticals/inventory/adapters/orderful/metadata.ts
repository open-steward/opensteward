export const metadata = {
  platform: 'orderful',
  totalResources: 7,
  availableResources: ['purchase-order', 'supplier'],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Orderful has no location master-data endpoint. It is a pure EDI transaction routing platform; the only REST resources are /transactions, /relationships, /inbox, /deliveries, /acknowledgments, and /organizations.',
    },
    {
      resource: 'product',
      reason:
        'Orderful has no product catalog endpoint. Product data appears only embedded within 850 Purchase Order and 832 Price/Sales Catalog EDI transaction messages, not as a dedicated REST resource.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'UNVERIFIED: EDI transaction type 947_WAREHOUSE_INVENTORY_ADJUSTMENT_ADVICE confirmed to exist at /v3/transactions, but the Mosaic JSON message schema (field names in heading/detail) is behind a login wall and cannot be verified without an account.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'UNVERIFIED: EDI transaction types 943_WAREHOUSE_STOCK_TRANSFER_SHIPMENT_ADVICE and 944_WAREHOUSE_STOCK_TRANSFER_RECEIPT_ADVICE confirmed to exist at /v3/transactions, but the Mosaic JSON message schema (field names in heading/detail) is behind a login wall and cannot be verified without an account.',
    },
    {
      resource: 'stock-level',
      reason:
        'It has no stock-level resource; stock arrives only inside 846 documents whose content "depends on how the Transaction is backed" (X12, EDIFACT or JSON), and the published 846 schema carries no on-hand quantity',
    },
  ],
} as const
