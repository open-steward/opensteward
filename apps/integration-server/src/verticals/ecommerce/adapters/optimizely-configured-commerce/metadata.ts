export const metadata = {
  platform: 'optimizely-configured-commerce',
  totalResources: 11,
  availableResources: ['product', 'collection', 'location', 'customer', 'order'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        "The Storefront v1 Products API returns pricing on `pricing` at the parent-product level with no documented, separately-enumerable variant/SKU entity — configuration-driven \"styled products\" (when a catalog uses them) are addressed via a `configuration` query param on the single-product GET, not a listable Variant resource, so a generically correct implementation could not be verified against public docs.",
    },
    {
      resource: 'inventory',
      reason:
        'The only documented inventory endpoint, `POST /api/v1/realtimeinventory`, looks up an explicit array of product ids passed in the request body — it is not an enumerable or paginated listing. The sync worker calls every list method with only `{page, limit}`, which this endpoint cannot answer (there is no way to ask it for "the next page of inventory" without already knowing which product ids to ask about), so no correct `listInventoryLevels` can be implemented against it.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Order responses can carry a `shipmentPackages` field, but the Order-module RMA-and-shipment handler docs mark the underlying "GET Shipment"/"GET Shipment Collection" operations as internal service calls with no published public REST endpoint or field-level schema — there is no verifiable contract to implement against.',
    },
    {
      resource: 'refund',
      reason:
        'The only order-adjacent write endpoint is `POST /api/v1/orders/{id}/returns`, which sends an RMA request email for manual processing — it is not an API-driven refund, and no refund/credit-memo resource is documented.',
    },
    {
      resource: 'transaction',
      reason: 'No payment-transaction resource is documented in the Storefront or Admin API references.',
    },
    {
      resource: 'discount',
      reason:
        'The only promotions API (`/api/v1/carts/{cartId}/promotions`) applies or removes an existing promotion code on a cart — it is cart-management, not discount/promotion definition management, and no endpoint to create, read, update, or delete a promotion definition is documented.',
    },
  ],
} as const
