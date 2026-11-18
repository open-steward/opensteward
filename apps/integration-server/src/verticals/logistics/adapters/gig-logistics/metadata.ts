export const metadata = {
  platform: 'gig-logistics',
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
      reason: 'UNVERIFIED: The GIG Logistics developer portal (giglogistics.com/developer/) returns HTTP 403; no public API spec documents a /carriers listing endpoint — the API appears scoped to shipments, tracking, rates, labels, and orders only',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: The GIG Logistics developer portal returns HTTP 403; no manifest or end-of-day close-out endpoint is referenced in any publicly accessible documentation',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: GIG Logistics offers warehousing services but the developer portal (giglogistics.com/developer/) returns HTTP 403; no warehouse listing endpoint is documented in publicly accessible sources',
    },
  ],
} as const
