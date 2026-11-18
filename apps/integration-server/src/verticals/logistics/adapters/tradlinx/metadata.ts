export const metadata = {
  platform: 'tradlinx',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Tradlinx is a read-only ocean container visibility platform; no carrier-management API is documented publicly — full API reference is gated behind sales/demo access.',
    },
    {
      resource: 'label',
      reason:
        'Tradlinx is an ocean visibility platform and does not offer shipping label generation; label creation is outside its product scope.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Tradlinx surfaces bill-of-lading data as part of shipment tracking, but no standalone manifest CRUD API is publicly documented — full API reference is gated behind sales/demo access.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Tradlinx does not expose an order-management API publicly; the platform is a read-only visibility tool — full API reference is gated behind sales/demo access.',
    },
    {
      resource: 'rate',
      reason:
        'Tradlinx is an ocean visibility platform and does not offer rate shopping or freight quoting; rate APIs are outside its product scope.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Tradlinx does not expose a warehouse-management API publicly; the platform is a read-only visibility tool — full API reference is gated behind sales/demo access.',
    },
  ],
} as const
