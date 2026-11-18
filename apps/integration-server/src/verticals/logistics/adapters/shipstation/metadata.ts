export const metadata = {
  platform: 'shipstation',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'order',
    'rate',
    'shipment',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'ShipStation API v1 (ssapi.shipstation.com) has no manifest operation: the V1 OpenAPI (https://docs.shipstation.com/apis/shipstation-v1/openapi, 47 operations) has no createmanifest, scan-form or end-of-day route, and a 2026-09-13 probe of POST /shipments/createmanifest returned 401 identically to a non-existent path (v1 authenticates before routing). Manifests exist only on API v2 (POST /v2/manifests, API-Key auth), which this v1 adapter does not speak.',
    },
    {
      resource: 'trackingevent',
      reason:
        'ShipStation API v1 (ssapi.shipstation.com) has no tracking-events endpoint. The /shipments response exposes only a trackingNumber string; per-event status history is not available in v1.',
    },
  ],
} as const
