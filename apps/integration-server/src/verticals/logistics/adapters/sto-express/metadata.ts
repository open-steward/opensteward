export const metadata = {
  platform: 'sto-express',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; no publicly documented carrier-listing endpoint found',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; label printing is referenced via stc.order.waybill.apply but response field names for a standalone label endpoint are not confirmed by any publicly accessible documentation',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; no publicly documented manifest or end-of-day consolidation endpoint found',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; no publicly documented fulfillment-order listing endpoint found (the orders POST path used by createShipment is a shipping-order creation endpoint, not a fulfillment-order resource)',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; stc.network.serviceability.check is mentioned in third-party sources but endpoint URL, request shape, and response fields are not confirmed by any publicly accessible documentation',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: STO Express open platform (open.sto.cn) requires authenticated login to access API documentation; no publicly documented warehouse management endpoint found',
    },
  ],
} as const
