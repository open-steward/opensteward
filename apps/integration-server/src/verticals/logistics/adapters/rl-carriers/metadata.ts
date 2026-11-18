export const metadata = {
  platform: 'rl-carriers',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'R+L Carriers has no manifest/SCAN-form concept; LTL Bill of Ladings serve as shipping documents',
    },
    {
      resource: 'order',
      reason: 'R+L Carriers is a pure LTL freight carrier with no order management; shipments are created via Pickup Requests and BOLs',
    },
    {
      resource: 'warehouse',
      reason: 'R+L Carriers uses its own service center network; no customer warehouse endpoint exists in the API',
    },
  ],
} as const
