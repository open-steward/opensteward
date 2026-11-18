export const metadata = {
  platform: 'petpooja',
  totalResources: 10,
  availableResources: ['collection', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Petpooja Online Ordering API has no customer management endpoints; customer details are embedded fields on order payloads only.',
    },
    {
      resource: 'discount',
      reason:
        'Petpooja Online Ordering API has no discount/coupon management endpoints; discount amounts appear as a field on orders.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Petpooja Online Ordering API has no fulfillment endpoints; delivery status is tracked via order_status on the order object.',
    },
    {
      resource: 'inventory',
      reason:
        'Petpooja Online Ordering API has no inventory level endpoints; stock toggling is managed inside the POS UI, not via the partner API.',
    },
    {
      resource: 'location',
      reason:
        'Petpooja Online Ordering API has no location endpoints; the API scope is per-restaurant and does not expose multi-location data.',
    },
    {
      resource: 'refund',
      reason:
        'Petpooja Online Ordering API has no refund endpoints; refunds are handled internally within the POS and are not exposed to partner integrations.',
    },
    {
      resource: 'transaction',
      reason:
        'Petpooja Online Ordering API has no transaction endpoints; payment status is a field (payment_status) on the order object only.',
    },
  ],
} as const
