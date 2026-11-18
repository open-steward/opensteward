export const metadata = {
  platform: 'deposco',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'order',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'rate',
      reason:
        'Deposco rate shopping is a UI/automation feature that delegates to carrier APIs (FedEx, UPS, Techdinamics techSHIP); no public /rates REST endpoint is documented.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Deposco developer portal requires a mandatory login to view API docs; no external source confirms or denies a manifest REST endpoint.',
    },
  ],
} as const
