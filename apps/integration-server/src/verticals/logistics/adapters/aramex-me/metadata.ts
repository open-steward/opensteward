export const metadata = {
  platform: 'aramex-me',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Aramex is the carrier itself; the API exposes no endpoint to list carriers' },
    { resource: 'order', reason: 'Aramex is a carrier API with no order-management concept or endpoint' },
    { resource: 'manifest', reason: 'UNVERIFIED: Shipment Preparation API is documented but PDF returned HTTP 403; Shipping Services WSDL has no CreateManifest operation' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Location API has FetchOffices but the response schema could not be verified (Location API manual returned HTTP 403)' },
  ],
} as const
