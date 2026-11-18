export const metadata = {
  platform: 'hermes-de',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'manifest', reason: 'Hermes Germany does not require or support manifesting; confirmed by ShipEngine and ShipStation carrier guides' },
    { resource: 'order', reason: 'Hermes DE is a pure parcel carrier with no order-management REST API; only label creation and tracking are documented' },
    { resource: 'warehouse', reason: 'No warehouse management API documented for Hermes Germany; pure carrier with no facility-management endpoints' },
    { resource: 'carrier', reason: 'UNVERIFIED: de-api.hermesworld.com requires an API key to access; no public carrier-list endpoint found in available documentation' },
  ],
} as const
