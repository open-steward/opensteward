export const metadata = {
  platform: 'instamojo',
  totalResources: 10,
  availableResources: [
    'order',
    'transaction',
    'refund',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'No collection concept exists in the Instamojo API; Instamojo is a payment gateway, not a catalog platform.',
    },
    {
      resource: 'customer',
      reason: 'No dedicated customer endpoint exists; buyer details (name, email, phone) are embedded within orders only, with no stable customer ID.',
    },
    {
      resource: 'discount',
      reason: 'No discount management endpoint in the standard v2 API; MDP mojostore coupons require separate merchant enrollment and different OAuth scopes (coupons:read).',
    },
    {
      resource: 'fulfillment',
      reason: 'Instamojo is a payment gateway with no physical fulfillment or shipping tracking concept.',
    },
    {
      resource: 'inventory',
      reason: 'No inventory management concept exists in the Instamojo payment API; inventory levels are not tracked.',
    },
    {
      resource: 'location',
      reason: 'No warehouse or physical location concept exists in the Instamojo API.',
    },
  ],
} as const
