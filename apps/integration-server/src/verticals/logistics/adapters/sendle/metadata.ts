export const metadata = {
  platform: 'sendle',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Sendle is itself the single carrier; no carrier-listing API endpoint exists',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: POST /manifests and GET /manifests endpoints are documented but the JSON response field names are not accessible from public static docs (interactive-only examples); cannot confirm exact schema without fabrication risk',
    },
    {
      resource: 'order',
      reason:
        "Sendle shipping orders are already mapped to the Shipment resource; Sendle has no OMS-style order concept (no line items, customer IDs, or monetary amounts) — the platform is a pure parcel carrier",
    },
    {
      resource: 'warehouse',
      reason: 'Sendle has no warehouse management API; no such endpoint exists',
    },
  ],
} as const
