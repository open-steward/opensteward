export const metadata = {
  platform: 'glovo',
  totalResources: 8,
  availableResources: ['order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Glovo is a single-carrier on-demand platform; the Partners and LaaS APIs expose no carrier-listing endpoint.',
    },
    {
      resource: 'label',
      reason:
        'Glovo does not issue shipping labels; couriers are dispatched internally and no label endpoint is documented.',
    },
    {
      resource: 'manifest',
      reason:
        'Glovo has no manifest concept; multi-parcel manifests are not part of the on-demand courier model.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Glovo Partners/LaaS API docs are behind partner-login walls; no public warehouse endpoint was found in any accessible documentation or third-party SDK.',
    },
  ],
} as const
