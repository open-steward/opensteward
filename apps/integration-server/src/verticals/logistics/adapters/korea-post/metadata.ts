export const metadata = {
  platform: 'korea-post',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'Korea Post has no manifest API concept in its public or business portal.',
    },
    {
      resource: 'order',
      reason: 'Korea Post has no order management endpoint; it is a carrier, not an OMS.',
    },
    {
      resource: 'rate',
      reason:
        'No confirmable rate/quote endpoint: biz.epost.go.kr (the contract-customer portal) ' +
        'renders a client-side shell with no public API reference, /openapi 403s without a ' +
        'business login, and no SDK for it exists on GitHub. getRates was removed from index.ts.',
    },
    {
      resource: 'warehouse',
      reason: 'Korea Post has no warehouse API; post offices are returned by a separate XML-only finder API that does not map to the logistics warehouse interface.',
    },
  ],
} as const
