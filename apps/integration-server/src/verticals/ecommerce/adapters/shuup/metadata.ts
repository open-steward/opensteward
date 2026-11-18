export const metadata = {
  platform: 'shuup',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'Shuup discount/campaign data lives in the shuup.discounts and shuup.campaigns Django apps which have no registered DRF viewset under /api/v1/shuup/; discount management is admin-UI-only.',
    },
    {
      resource: 'refund',
      reason:
        'Shuup exposes refund creation only as action sub-routes on orders (POST /api/v1/shuup/order/{id}/create_refund/); there is no standalone refund resource or list/get endpoint.',
    },
    {
      resource: 'transaction',
      reason:
        'Shuup tracks payments via the internal Payment model but does not expose a /api/v1/shuup/payment/ or /api/v1/shuup/transaction/ DRF endpoint.',
    },
  ],
} as const
