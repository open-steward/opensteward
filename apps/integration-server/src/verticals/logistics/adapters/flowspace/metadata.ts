export const metadata = {
  platform: 'flowspace',
  totalResources: 8,
  availableResources: ['order', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); carrier endpoint paths and response shape could not be confirmed without credentials. Carrier data appears embedded in order responses.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); label endpoint paths and response shape could not be confirmed without credentials.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); manifest endpoint paths and response shape could not be confirmed without credentials.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); rate/rate-shopping endpoint paths and response shape could not be confirmed without credentials.',
    },
    {
      resource: 'shipment',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); shipment endpoint paths and response shape could not be confirmed without credentials.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Flowspace developer API docs are behind a private login portal (developers.flow.space); warehouse endpoint paths and response shape could not be confirmed without credentials.',
    },
  ],
} as const
