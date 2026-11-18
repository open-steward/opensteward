export const metadata = {
  platform: 'bringg',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Bringg carriers are external fleet integrations; the partner_api has no endpoint to enumerate them' },
    { resource: 'rate', reason: 'No shipping rate or quote endpoint exists in the partner_api' },
    { resource: 'label', reason: 'UNVERIFIED: Package label generation uses per-merchant service-GUID endpoints (not a standard partner_api/labels REST path); docs accessible only with tenant credentials' },
    { resource: 'manifest', reason: 'UNVERIFIED: Create Manifest exists only in the v2 Delivery Hub API (us2-api.bringg.com/v2/), not the partner_api base used by this adapter' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Teams (warehouses) listing uses per-merchant service-GUID endpoints, no partner_api/teams REST path confirmed in public documentation' },
  ],
} as const
