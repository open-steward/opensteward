export const metadata = {
  platform: 'shipbubble',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'Shipbubble has no manifest concept or endpoint; the API covers rates, labels, and tracking only.',
    },
    {
      resource: 'order',
      reason: 'Shipbubble has no order management API; shipments are created directly via the labels endpoint without an order layer.',
    },
    {
      resource: 'warehouse',
      reason: 'Shipbubble has no warehouse resource; sender addresses are stored in an address book (address_code) but lack warehouse-specific fields (cutoff time, timezone, inventory).',
    },
  ],
} as const
