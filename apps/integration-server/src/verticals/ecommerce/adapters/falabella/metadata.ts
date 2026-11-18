export const metadata = {
  platform: 'falabella',
  totalResources: 11,
  availableResources: ['product', 'location', 'inventory', 'order', 'fulfillment'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        'Falabella models variants as sibling products sharing a ParentSku, not a first-class ' +
        'parent/variant hierarchy the Seller API documents a clean response mapping for.',
    },
    {
      resource: 'collection',
      reason:
        "GetCategoryTree is Falabella's fixed, leaf-level marketplace taxonomy every product must " +
        'be assigned into; sellers cannot create or manage their own collections via the Seller API.',
    },
    {
      resource: 'customer',
      reason:
        'Falabella exposes no customer/buyer directory API; buyer identity is limited to the ' +
        'name/email/phone embedded on each order’s AddressBilling/AddressShipping.',
    },
    {
      resource: 'refund',
      reason: 'The documented action set has no refund resource — only order/item status transitions.',
    },
    {
      resource: 'transaction',
      reason: 'The documented action set has no payment-transaction resource.',
    },
    {
      resource: 'discount',
      reason: 'The documented action set has no seller-managed discount/promotion resource.',
    },
  ],
} as const
