export const metadata = {
  platform: '123loadboard',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: 123loadboard does have a truck/carrier search feature in its API, but the developer portal (developers.123loadboard.com) requires authentication and no public endpoint path is documented; cannot confirm the exact endpoint or response shape.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: 123loadboard documents a "Rate Check" capability on its API page, but the developer portal (developers.123loadboard.com) requires authentication and no public endpoint path is documented; cannot confirm the exact endpoint or response shape.',
    },
    {
      resource: 'order',
      reason:
        '123loadboard is a freight-matching load board marketplace; it has no order management concept separate from loads/shipments.',
    },
    {
      resource: 'label',
      reason:
        '123loadboard is a freight-matching marketplace and does not generate or manage shipping labels.',
    },
    {
      resource: 'manifest',
      reason:
        '123loadboard is a freight-matching marketplace and has no manifest or pickup-closeout concept.',
    },
    {
      resource: 'warehouse',
      reason:
        '123loadboard is a freight-matching marketplace and has no warehouse management concept.',
    },
  ],
} as const
