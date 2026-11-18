export const metadata = {
  platform: 'da-vinci-unified',
  totalResources: 8,
  availableResources: [
    'carrier',
    'order',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Swagger UI at api.wdgcorp.com/swagger requires authentication; label data appears embedded in shipment responses (LabelURL field) suggesting WMS-managed printing rather than a standalone REST endpoint, but no public docs confirm or deny a /labels resource.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Swagger UI at api.wdgcorp.com/swagger requires authentication; end-of-day manifests in Da Vinci are typically generated via internal WMS workflows; no public documentation confirms a /manifests REST endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Swagger UI at api.wdgcorp.com/swagger requires authentication; rate shopping in Da Vinci is described as an internal WMS capability at the shipping station; no public documentation confirms a /rates REST endpoint.',
    },
  ],
} as const
