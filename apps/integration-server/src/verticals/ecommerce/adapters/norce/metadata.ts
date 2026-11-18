export const metadata = {
  platform: 'norce',
  totalResources: 11,
  availableResources: ['product', 'customer', 'order'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        "Norce's Commerce Query OpenAPI schema (queryproducts) shows a Product/Variant record carries no direct selling price — price lives on a separate ProductSkuPricelist keyed by CurrencyId, itself requiring a further join against Core's Currency entity for an ISO code. Assembling a canonical variant (whose `price` field is required) would need multiple unverified cross-entity joins beyond what any single documented endpoint provides.",
    },
    {
      resource: 'collection',
      reason:
        "Norce's Commerce Query schema exposes `ProductCategory` only as a Product↔Category association record (ProductId, CategoryId, IsPrimary, SortOrder) with no name/description fields. No separate Category entity type or entity set exists in either the Products or Core query groups' published OpenAPI specs; category master data appears to live in Norce's Management API, whose schema is not published on the developer reference site.",
    },
    {
      resource: 'location',
      reason:
        '`Warehouse` and `WarehouseLocation` schema types are referenced in the Commerce Query OpenAPI document (as nested types under stock records) but are not exposed as their own queryable entity set, and their property lists are not expanded in the published spec — there is no documented endpoint to list or fetch a location as a first-class resource.',
    },
    {
      resource: 'inventory',
      reason:
        'The on-hand stock schema (ProductSkuOnHand: PartNo, WarehouseId, OnHandValue, IncomingValue, …) is fully defined in the Commerce Query OpenAPI spec, but it is exposed only through the `GetDeltaProductSkuOnHands` OData function import, not a plain queryable entity set. Norce’s public reference does not document that function’s callable parameter signature, so a correct request could not be constructed and verified.',
    },
    {
      resource: 'fulfillment',
      reason:
        "Order records can carry delivery-note data (Orders/DeliveryNotes exists as a Commerce Query entity set) but Norce's own docs give no field-level schema for it, and the corresponding write operations (UpdateDeliveryNotePackage) are undocumented RPC endpoints with no published request/response contract.",
    },
    {
      resource: 'refund',
      reason:
        'No refund or credit-note entity is documented in Commerce Query or Commerce Services. Orders/Invoices exists but does not distinguish a credit note from a standard invoice in any published schema.',
    },
    {
      resource: 'transaction',
      reason:
        'No payment-transaction entity is documented in any Commerce Query group (Application, Core, Customers, Orders, Products, Reporting, Shopping) fetched from the public API reference.',
    },
    {
      resource: 'discount',
      reason:
        "No discount/promotion entity is documented in Commerce Query; Norce's Shopping service (pricing/promotion rules) has no published field-level schema on the public developer reference site.",
    },
  ],
} as const
