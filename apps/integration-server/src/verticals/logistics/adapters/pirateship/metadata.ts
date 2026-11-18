export const metadata = {
  platform: 'pirateship',
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
      reason: 'PirateShip has no dedicated carriers endpoint; carrier data (USPS/UPS) is embedded in rate responses only and is not listable as a separate resource.',
    },
    {
      resource: 'manifest',
      reason: 'PirateShip does not support manifests; the platform is a label-printing and rate-shopping tool and has no end-of-day manifest concept.',
    },
    {
      resource: 'warehouse',
      reason: 'PirateShip has no warehouse concept; the platform manages shipment labels from a single sender address, not warehouse locations.',
    },
  ],
} as const
