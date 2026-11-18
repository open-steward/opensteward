export const metadata = {
  platform: 'elogii',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'eLogii is a last-mile route optimization platform managing its own delivery fleet; it has no multi-carrier concept or /carriers endpoint in its API.',
    },
    {
      resource: 'label',
      reason: 'eLogii does not generate carrier shipping labels; label generation is not part of its delivery management API.',
    },
    {
      resource: 'manifest',
      reason: 'eLogii has no manifest concept or endpoint; it manages route plans and tasks rather than carrier manifests.',
    },
    {
      resource: 'rate',
      reason: 'eLogii does not perform carrier rate shopping; it is a route optimizer for own-fleet delivery, not a multi-carrier shipping platform.',
    },
  ],
} as const
