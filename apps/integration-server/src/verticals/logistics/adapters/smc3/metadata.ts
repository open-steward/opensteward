export const metadata = {
  platform: 'smc3',
  totalResources: 8,
  availableResources: ['carrier', 'rate'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'SMC3 is a freight-intelligence platform (rating + transit). Neither CCXL nor RWXL exposes label generation, storage, or retrieval endpoints.',
    },
    {
      resource: 'manifest',
      reason:
        'SMC3 provides no manifest management endpoints. CCXL and RWXL cover transit and rate queries only.',
    },
    {
      resource: 'order',
      reason: 'SMC3 is not an order management system. No order endpoints exist in CCXL or RWXL.',
    },
    {
      resource: 'warehouse',
      reason:
        'SMC3 does not model warehouses. Terminal lookups (terminalsbypostalcode, terminalbyterminalcode, terminalsbycarrier) describe carrier service terminals, not shipper warehouses.',
    },
    {
      resource: 'shipment',
      reason:
        'CarrierConnect XL documents no shipment or tracking endpoint. POST /transit is a per-lane transit-time lookup (TransitRequest: carriers, destination, origin, pickupDate, shipmentId), not a shipment record or event history.',
    },
    {
      resource: 'trackingevent',
      reason:
        'CarrierConnect XL documents no shipment or tracking endpoint. POST /transit is a per-lane transit-time lookup (TransitRequest: carriers, destination, origin, pickupDate, shipmentId), not a shipment record or event history.',
    },
  ],
} as const
