/**
 * Fluent Commerce adapter — resource coverage metadata.
 *
 * Fluent Commerce is an Order Management System (OMS). Its domain model
 * covers products, inventory positions, and locations, but does not include
 * procurement supply-chain entities such as suppliers, purchase orders,
 * inter-location stock transfers, or stock adjustments.
 *
 * Sources confirmed via docs.fluentcommerce.com (domain-model-entities,
 * graphql-inventory-queries, graphql-product-queries, graphql-queries).
 */
export const metadata = {
  platform: 'fluent-commerce',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'stock-level',
  ],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'Fluent Commerce has no Supplier entity; vendor management is outside its OMS domain model.',
    },
    {
      resource: 'purchase-order',
      reason:
        'No PurchaseOrder entity in Fluent Commerce; procurement is handled by upstream ERP or WMS systems.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'No StockTransfer entity in Fluent Commerce; inter-location stock moves are not a first-class concept. The Wave entity is an order-picking batch, not a stock transfer.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'No StockAdjustment query resource in Fluent Commerce; inventory corrections are applied via mutation directly to inventoryPosition but are not exposed as a queryable resource.',
    },
  ],
} as const
