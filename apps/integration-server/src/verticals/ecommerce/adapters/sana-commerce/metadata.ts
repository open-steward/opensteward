export const metadata = {
  platform: 'sana-commerce',
  totalResources: 10,
  availableResources: ['collection', 'customer', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'Sana Commerce does not expose a discount/promotion endpoint via its web service API. Discounts are managed through the connected ERP system (SAP, Microsoft Dynamics) and are applied server-side during basket calculation.',
    },
    {
      resource: 'fulfillment',
      reason:
        'No fulfillment endpoint exists in the Sana Commerce web service API. Fulfillment is handled entirely by the ERP system; Sana does not expose shipping/fulfillment state as a standalone resource.',
    },
    {
      resource: 'inventory',
      reason:
        'Inventory levels are calculated and stored exclusively in the connected ERP system. The Sana Commerce web service API has no inventory or stock endpoint; stock data is embedded in catalog responses but not addressable as a separate resource.',
    },
    {
      resource: 'location',
      reason:
        'Sana Commerce does not expose warehouse or fulfillment-location endpoints via its web service API. Physical location data resides in the ERP.',
    },
    {
      resource: 'refund',
      reason:
        'No refund or return-order endpoint exists in the Sana Commerce web service API. Return orders are created via the storefront and persisted directly to the ERP; there is no REST endpoint to list or retrieve them.',
    },
    {
      resource: 'transaction',
      reason:
        'Sana Commerce does not expose payment transaction endpoints via its web service API. Payment capture and refund references are handled through Sana Pay / ERP payment integrations, not the CommerceService.svc REST layer.',
    },
  ],
} as const
