export const metadata = {
  platform: 'flash-express',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'rate',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Flash Express is a single-carrier network; no carrier listing endpoint exists in the API',
    },
    {
      resource: 'label',
      reason: 'POST /open/v1/orders/{pno}/pre_print returns a binary PDF stream only — no JSON label metadata endpoint exists',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or batch submission endpoints are documented in the Flash Express Open API',
    },
  ],
} as const
