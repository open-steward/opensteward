export const metadata = {
  platform: 'quiqup',
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
      reason:
        'Quiqup operates its own single-carrier fleet; the platform is not a multi-carrier marketplace and exposes no carrier-listing endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Manifestation is referenced as a feature by third-party integrators but no dedicated /manifests endpoint appears in accessible public API documentation.',
    },
    {
      resource: 'warehouse',
      reason:
        'Quiqup is a last-mile delivery service, not a warehousing platform; no warehouse management API is documented or offered.',
    },
  ],
} as const
