export const metadata = {
  platform: 'jt-express',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'J&T Express is a single-carrier platform; there is no list-carriers endpoint — the carrier identity is always "jt-express"',
    },
    {
      resource: 'label',
      reason: 'No dedicated label management API; label URL is embedded in the order/shipment creation response and exposed via the shipment resource',
    },
    {
      resource: 'manifest',
      reason: 'J&T Express API has no manifest submission endpoint; confirmed absent from official developer portal (developer.jet.co.id)',
    },
    {
      resource: 'order',
      reason: 'J&T Express has no separate order management layer; the "order" concept maps directly to the shipment resource (createOrder = createShipment returning a waybill)',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: A tariff check API is referenced on the developer portal but the endpoint path, request fields, and response schema are behind a partner login and could not be confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'J&T Express API has no warehouse management endpoint; confirmed absent from official developer portal',
    },
  ],
} as const
