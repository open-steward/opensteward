export const metadata = {
  platform: 'dhl',
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
      reason: 'DHL Express does not require or support manifest submission; confirmed absent by official DHL/ShipEngine docs',
    },
    {
      resource: 'order',
      reason: 'DHL Express has no order management endpoint; it is a carrier-only API with no OMS capability',
    },
    {
      resource: 'warehouse',
      reason: 'DHL Express has no warehouse management endpoint; confirmed not supported by ShipEngine/DHL documentation',
    },
  ],
} as const
