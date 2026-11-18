export const metadata = {
  platform: 'postnord',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'No manifest submission or retrieval API exists in PostNord\'s public REST API',
    },
    {
      resource: 'order',
      reason: 'PostNord is a carrier, not an OMS; no order management API exists',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Pricing endpoint confirmed on Norway portal (POST /rest/transport-booking/v2/booking/products) but request/response schema for main api2.postnord.com base URL is behind login and not publicly documented',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management API; PostNord service points are pickup locations, not warehouses',
    },
  ],
} as const
