export const metadata = {
  platform: 'yamato',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Yamato is the sole carrier; the EC Fulfillment API has no endpoint to list or retrieve carrier records.',
    },
    {
      resource: 'label',
      reason:
        'Labels are generated internally by the Yamato warehouse during fulfillment; no standalone label endpoint or label URL is exposed via the EC Fulfillment API.',
    },
    {
      resource: 'manifest',
      reason:
        'Yamato manages manifests internally in the warehouse; the EC Fulfillment API exposes no manifest resource.',
    },
    {
      resource: 'order',
      reason:
        'The EC Fulfillment API (出荷受付API) is a fire-and-forget shipment instruction; no order list, get, update, or cancel operations are available.',
    },
    {
      resource: 'rate',
      reason:
        'The EC Fulfillment API has no rate-quote endpoint; shipping costs are determined by the pre-negotiated contract with Yamato.',
    },
    {
      resource: 'warehouse',
      reason:
        'The 在庫照会API is an inventory stock-inquiry endpoint only; no warehouse CRUD or location management operations are exposed.',
    },
  ],
} as const
