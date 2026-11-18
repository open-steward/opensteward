export const metadata = {
  platform: 'convoy',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Convoy is an FTL freight brokerage platform; its public Broker API (docs.convoy.com) only exposes loads, quotes, tracking, and webhooks. A dedicated carrier-list endpoint may exist behind authentication but could not be confirmed from publicly available documentation.',
    },
    {
      resource: 'label',
      reason:
        'Convoy is a full-truckload freight brokerage and does not generate or manage parcel shipping labels; BOLs are handled operationally outside the API.',
    },
    {
      resource: 'manifest',
      reason:
        'Convoy is a full-truckload freight brokerage and has no parcel manifest or pickup-closeout concept in its API.',
    },
    {
      resource: 'order',
      reason:
        'Convoy has no separate order resource; freight loads (mapped to shipments) serve as the order equivalent in the Broker API.',
    },
    {
      resource: 'warehouse',
      reason:
        'Convoy is a freight-matching brokerage platform and has no warehouse management concept or endpoint in its API.',
    },
  ],
} as const
