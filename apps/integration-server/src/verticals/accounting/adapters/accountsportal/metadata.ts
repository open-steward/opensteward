export const metadata = {
  platform: 'accountsportal',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'organization',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm an /expenses endpoint exists.',
    },
    {
      resource: 'journal',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm a /journals endpoint exists.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm an /orders endpoint exists.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm a /purchase_orders endpoint exists.',
    },
    {
      resource: 'salesorder',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm a /sales_orders endpoint exists.',
    },
    {
      resource: 'transaction',
      reason:
        'UNVERIFIED: AccountsPortal has no public REST API or OAuth developer programme as of 2026; all API endpoints in this adapter are placeholders. Cannot confirm a /transactions endpoint exists.',
    },
  ],
} as const
