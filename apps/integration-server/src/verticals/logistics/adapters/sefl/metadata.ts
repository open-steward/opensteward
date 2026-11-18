export const metadata = {
  platform: 'sefl',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'SEFL is a single LTL carrier with no carrier-listing API; there is no endpoint that returns a list of carriers.',
    },
    {
      resource: 'label',
      reason:
        'SEFL does not provide a label-printing API; the Document Retrieval service returns PDFs of existing BOLs by PRO number but does not expose a label resource.',
    },
    {
      resource: 'manifest',
      reason:
        'SEFL has no manifest management API; no endpoint for creating or listing manifests is documented in WebConnect.',
    },
    {
      resource: 'order',
      reason:
        'SEFL has no order management API; the platform offers pickup scheduling and shipment creation but no order resource endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'SEFL has no warehouse API; it is a freight carrier, not a 3PL/WMS, and exposes no warehouse endpoints.',
    },
  ],
} as const
