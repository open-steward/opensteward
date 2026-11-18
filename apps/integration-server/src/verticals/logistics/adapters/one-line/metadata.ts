export const metadata = {
  platform: 'one-line',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'ONE LINE is the carrier itself; no carrier-registry REST endpoint exists — the platform does not expose a multi-carrier catalogue API.',
    },
    {
      resource: 'label',
      reason:
        'ONE LINE is an ocean freight carrier; it does not generate domestic shipping labels (PDF/ZPL/ZPL2). No label endpoint exists in their REST API.',
    },
    {
      resource: 'manifest',
      reason:
        'Ocean manifests are handled via EDI (ANSI/EDIFACT) rather than a REST endpoint; no manifest REST API is documented or publicly available.',
    },
    {
      resource: 'order',
      reason:
        'Booking/order management is handled via EDI messages and the ONE eCommerce portal, not a public REST order API.',
    },
    {
      resource: 'rate',
      reason:
        'Rate quotation is available only through the ONE QUOTE web portal, not a documented public REST rate endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'ONE LINE is an ocean carrier, not a 3PL or WMS provider; no warehouse management API exists.',
    },
  ],
} as const
