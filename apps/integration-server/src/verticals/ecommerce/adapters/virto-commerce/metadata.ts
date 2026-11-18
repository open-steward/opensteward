export const metadata = {
  platform: 'virto-commerce',
  totalResources: 11,
  availableResources: [
    'product',
    'variant',
    'collection',
    'location',
    'inventory',
    'customer',
    'order',
    'fulfillment',
    'transaction',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'refund',
      reason:
        'Refunds are not a standalone resource in the Virto Commerce REST API — they exist only ' +
        'as a nested `refunds[]` array on a PaymentIn record, mutated via ' +
        'POST /api/order/payments/payment/refund (RefundOrderPaymentRequest) with no independent ' +
        'list/get endpoint of its own.',
    },
  ],
} as const
