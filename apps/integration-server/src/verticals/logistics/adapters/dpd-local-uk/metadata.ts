export const metadata = {
  platform: 'dpd-local-uk',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'DPD Local UK is itself the single carrier; the REST API exposes no endpoint for listing carrier records.',
    },
    {
      resource: 'manifest',
      reason:
        'DPD Local UK does not require manifesting — confirmed by ShipEngine DPD Local carrier guide: "Manifesting requirements: Not required."',
    },
    {
      resource: 'order',
      reason:
        'DPD Local UK API has no order-management concept or endpoint; it is a shipment/label/tracking API only.',
    },
    {
      resource: 'warehouse',
      reason:
        'DPD Local UK API exposes no warehouse or depot listing endpoint; depot assignment is handled via the contracted DPD account.',
    },
  ],
} as const
