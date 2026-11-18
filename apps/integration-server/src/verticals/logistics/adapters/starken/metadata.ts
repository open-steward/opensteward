export const metadata = {
  platform: 'starken',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Starken is a single-carrier platform; no carriers list endpoint exists in the API',
    },
    {
      resource: 'order',
      reason: 'Starken is a carrier-only platform with no order management API',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: A rate endpoint exists at gateway.starken.cl/quote/cotizador but cannot be confirmed at the adapter base URL api.starken.cl/v1/',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: No public documentation found for manifests; official API docs are gated behind commercial access',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Agency/city data exists at gateway.starken.cl/agency/city but cannot be confirmed at the adapter base URL api.starken.cl/v1/',
    },
  ],
} as const
