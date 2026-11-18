export const metadata = {
  platform: 'macropoint',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Macropoint API docs are behind a login portal; no public /carriers endpoint confirmed on api.macropoint.com/v2. Platform is a visibility/tracking service — no carrier directory API surface found in any accessible documentation.',
    },
    {
      resource: 'label',
      reason:
        'Macropoint is a freight-visibility platform (load tracking only); it does not generate or manage shipping labels.',
    },
    {
      resource: 'manifest',
      reason:
        'Macropoint does not offer manifest management; the platform is scoped to tracking-session lifecycle on loads.',
    },
    {
      resource: 'order',
      reason:
        'Macropoint does not have an order-management API; loads are tracking sessions, not purchase/fulfillment orders.',
    },
    {
      resource: 'rate',
      reason:
        'Macropoint is visibility-only and provides no rate-quote APIs.',
    },
    {
      resource: 'warehouse',
      reason:
        'Macropoint does not expose warehouse or location-directory endpoints; stop locations are embedded in load payloads only.',
    },
  ],
} as const
