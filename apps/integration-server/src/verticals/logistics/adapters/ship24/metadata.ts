export const metadata = {
  platform: 'ship24',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Ship24 is a tracking-only API and offers no label creation or printing endpoints (confirmed via OpenAPI spec).' },
    { resource: 'manifest', reason: 'Ship24 is a tracking-only API and offers no manifest endpoints (confirmed via OpenAPI spec).' },
    { resource: 'order', reason: 'Ship24 is a tracking-only API and offers no order management endpoints (confirmed via OpenAPI spec).' },
    { resource: 'rate', reason: 'Ship24 is a tracking-only API and offers no rate quoting endpoints (confirmed via OpenAPI spec).' },
    { resource: 'warehouse', reason: 'Ship24 is a tracking-only API and offers no warehouse management endpoints (confirmed via OpenAPI spec).' },
  ],
} as const
