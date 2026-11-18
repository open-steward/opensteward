export const metadata = {
  platform: 'pitney-bowes',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'No list/get carrier endpoint exists; the API only supports POST to register commercial carrier accounts (FedEx/UPS) with no programmatic retrieval.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: The fulfillment sub-API (POST /shippingservices/fulfillment/v1/orders) is referenced in search results but all fulfillment documentation pages return 404; response field names cannot be confirmed.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse management concept in the Pitney Bowes Shipping API; the carrier-facility endpoint (POST /v1/carrier-facility) returns Post Offices and carrier drop-off locations, not merchant-owned warehouses.',
    },
  ],
} as const
