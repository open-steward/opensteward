export const metadata = {
  platform: 'skynet',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Skynet is itself the sole carrier; no carrier-listing endpoint exists in the public API',
    },
    {
      resource: 'manifest',
      reason: 'No dedicated /manifests endpoint; manifestation is embedded in shipment creation and not separately accessible',
    },
    {
      resource: 'order',
      reason: 'Skynet is a courier service, not an OMS; no order management API is documented',
    },
    {
      resource: 'rate',
      reason: 'No rate-quoting endpoint found in public or partner documentation',
    },
    {
      resource: 'warehouse',
      reason: 'Skynet is a courier service, not a WMS; no warehouse management API is documented',
    },
  ],
} as const
