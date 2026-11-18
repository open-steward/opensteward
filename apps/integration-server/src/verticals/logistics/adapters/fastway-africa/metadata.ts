export const metadata = {
  platform: 'fastway-africa',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Fastway Africa is a single-carrier platform; no carrier listing or detail endpoint exists in the API',
    },
    {
      resource: 'order',
      reason: 'No order concept in the Fastway Africa API; consignments are part of the FastLabel labelling workflow, not a separate order resource',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse concept or endpoint in the Fastway Africa API',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: FastLabel manifest endpoints are documented for v2/v3 (api.fastway.org) but the v4 SA-specific API (api.fastway.co.za/v4/) paths are not publicly documented',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: PSC lookup (rate/quote) is documented for v2 (api.fastway.org/v2/psc/lookup) but v4 SA-specific paths are undocumented and require a franchise RFCode not provided by the standard RateRequestParams',
    },
  ],
} as const
