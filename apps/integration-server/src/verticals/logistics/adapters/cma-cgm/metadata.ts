export const metadata = {
  platform: 'cma-cgm',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'CMA CGM is itself an ocean carrier; the API provides no carrier-discovery endpoint — the carrier identity is a static constant.',
    },
    {
      resource: 'label',
      reason:
        'CMA CGM is an ocean carrier that issues Bills of Lading, not parcel shipping labels; no label REST API exists.',
    },
    {
      resource: 'manifest',
      reason:
        'Cargo manifests are exchanged via EDI (EDIFACT IFTMCS / Bill of Lading) only; no REST manifest API is offered.',
    },
    {
      resource: 'order',
      reason:
        'Bookings are placed and confirmed via EDI (EDIFACT IFTMBF) and inbound webhook push; there is no REST endpoint for listing or querying orders.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: A pricing/rates product exists in the CMA CGM API portal but requires a paid subscription and account login to access; endpoint paths and response shape could not be confirmed without credentials.',
    },
    {
      resource: 'warehouse',
      reason:
        'CMA CGM is an ocean carrier, not a warehouse/3PL operator; no warehouse management REST API exists.',
    },
  ],
} as const
