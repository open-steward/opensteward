export const metadata = {
  platform: 'reckon-one',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Reckon One API v2 Swagger spec is behind developer-partner authentication; no public documentation or third-party integration evidence confirms a /orders REST endpoint. Reckon One the app does not appear to have a generic order concept distinct from invoices.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'UNVERIFIED: Reckon One the app has a "purchase order management" UI feature, but the API v2 Swagger spec is behind developer-partner authentication and no public documentation, community thread, or third-party integration confirms a /purchaseOrders REST endpoint exists.',
    },
    {
      resource: 'salesorder',
      reason:
        'UNVERIFIED: No public documentation, community discussion, or third-party integration evidence confirms a sales-order concept or REST endpoint in Reckon One API v2. The Swagger spec is behind developer-partner authentication.',
    },
  ],
} as const
