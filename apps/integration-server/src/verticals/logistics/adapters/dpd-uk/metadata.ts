export const metadata = {
  platform: 'dpd-uk',
  totalResources: 8,
  availableResources: ['label', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'DPD UK is itself the single carrier; the REST API exposes no endpoint for listing carrier records.',
    },
    {
      resource: 'manifest',
      reason:
        'DPD UK does not require manifesting — confirmed by EasyPost, ShipEngine, and AfterShip integration guides.',
    },
    {
      resource: 'order',
      reason:
        'DPD UK API has no order-management concept or endpoint; it is a shipment/label/tracking API only.',
    },
    {
      resource: 'rate',
      reason:
        'DPD UK does not provide a rates API — confirmed by ShipEngine: "DPD UK does not send estimated rates … they do not currently provide a Rates API."',
    },
    {
      resource: 'warehouse',
      reason:
        'DPD UK API exposes no warehouse or depot listing endpoint; depot assignment is handled via the contracted DPD account.',
    },
  ],
} as const
