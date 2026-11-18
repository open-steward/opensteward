export const metadata = {
  platform: 'gofrugal',
  totalResources: 11,
  availableResources: ['inventory', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        'GOFRUGAL items are single-SKU rows in `GET /items` — no separate variant resource is documented.',
    },
    {
      resource: 'collection',
      reason:
        'The documented eCommerce Integration API surface (items + sales orders) has no category/' +
        'collection endpoint — see https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/' +
        'ecommerce-integration/api-integration/articles/api-integration.',
    },
    {
      resource: 'location',
      reason:
        '`locationId` appears only as a field on items/stock rows; there is no documented ' +
        'locations CRUD endpoint to list or fetch a location object.',
    },
    {
      resource: 'customer',
      reason:
        'No customer CRUD endpoint is documented — `customerId`/`customerName`/etc. appear only ' +
        'embedded on a sales order, not as an independently addressable resource.',
    },
    {
      resource: 'fulfillment',
      reason: 'Not part of the documented eCommerce Integration API — no shipment/fulfillment endpoint.',
    },
    {
      resource: 'refund',
      reason: 'Not part of the documented eCommerce Integration API — no returns/refunds endpoint.',
    },
    {
      resource: 'transaction',
      reason: 'Not part of the documented eCommerce Integration API — no payment-transaction endpoint.',
    },
    {
      resource: 'discount',
      reason:
        'Order items carry a `discountPercentage` field, but there is no documented discount/coupon ' +
        'resource to list, create, or manage independently of an order.',
    },
  ],
} as const
