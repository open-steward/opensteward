export const metadata = {
  platform: 'frenet',
  totalResources: 8,
  availableResources: [
    'label',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Frenet docs mention a "list available services" section and carrier fields in quote responses, but a dedicated carrier-listing endpoint could not be confirmed from publicly accessible documentation (full reference requires authenticated access).',
    },
    {
      resource: 'manifest',
      reason: 'Frenet does not expose a manifest API endpoint; "romaneio de frete" (freight manifest) printing is a platform dashboard UI feature only and is not available via the REST API.',
    },
    {
      resource: 'warehouse',
      reason: 'Frenet does not expose a warehouse API endpoint; stock locations ("locais de estoque") are configured in the platform dashboard only and are not available via the REST API.',
    },
  ],
} as const
