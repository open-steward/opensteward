export const metadata = {
  platform: 'joor',
  totalResources: 10,
  availableResources: ['collection', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'UNVERIFIED: JOOR v2 API has a connections endpoint (GET /v2/connection/{id}) that returns retailer/buyer data, but it uses a different base URL (api.jooraccess.com/v2) and auth scheme than the v4 adapter; cross-version compatibility could not be confirmed without credentials',
    },
    {
      resource: 'discount',
      reason:
        'No standalone discount GET endpoint; discounts appear only as nested fields inside connection and order objects in the v2 API',
    },
    {
      resource: 'fulfillment',
      reason:
        'JOOR does not expose a fulfillment/shipment tracking endpoint in either v2 or v4 APIs; order shipping status is tracked via the order status field only',
    },
    {
      resource: 'inventory',
      reason:
        'JOOR inventory management is write-only via the v2 bulk-inventory endpoint (POST/PUT only); no GET inventory endpoint is available to read stock levels',
    },
    {
      resource: 'location',
      reason:
        'UNVERIFIED: JOOR exposes "doors" (retail store locations) nested inside v2 connection responses, but no standalone GET /doors or /locations endpoint with a documented response schema was confirmed in either v2 or v4 API docs',
    },
    {
      resource: 'refund',
      reason:
        'JOOR is a wholesale B2B ordering platform; no refund endpoint exists in either v2 or v4 APIs',
    },
    {
      resource: 'transaction',
      reason:
        'JOOR Payments is a beta write-only API (CREATE/UPDATE only); no GET transaction/payment endpoint is documented in v2 or v4',
    },
  ],
} as const
