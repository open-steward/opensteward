export const metadata = {
  platform: 'ekart',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Ekart is itself the sole carrier; no carrier-listing endpoint exists in the public B2C API',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Ekart developer portal is behind authentication; label generation API is referenced by third-party integrators but exact endpoint URLs and response field names could not be confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Ekart developer portal is behind authentication; manifestation API is referenced by third-party integrators but exact endpoint URLs and response field names could not be confirmed',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Ekart developer portal is behind authentication; order/shipment creation fields beyond what is already implemented could not be confirmed from public docs',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Ekart developer portal is behind authentication; serviceability/EDD API is referenced but exact endpoint URLs and response field names could not be confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management endpoint exists in the Ekart public B2C API',
    },
  ],
} as const
