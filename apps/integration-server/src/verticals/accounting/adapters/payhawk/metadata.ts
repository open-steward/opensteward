export const metadata = {
  platform: 'payhawk',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'Payhawk is a spend-management / AP platform with no credit-memo concept or endpoint in the v3 REST API.',
    },
    {
      resource: 'invoice',
      reason:
        'No AR invoice endpoint exists in the Payhawk v3 REST API; AP-style bills are surfaced via the expenses endpoint (type=invoice) as the bill resource.',
    },
    {
      resource: 'journal',
      reason:
        'Payhawk does not expose a general-ledger journal endpoint; journal entries are written to connected ERP systems, not readable from the Payhawk API.',
    },
    {
      resource: 'order',
      reason:
        'No generic order endpoint exists in the Payhawk v3 REST API.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Purchase orders exist in the Payhawk portal and are referenced by webhooks, but no REST GET endpoint to list or retrieve POs is documented in the v3 API.',
    },
    {
      resource: 'salesorder',
      reason:
        'Payhawk is an AP / spend-management platform with no sales-order concept or endpoint.',
    },
    {
      resource: 'taxrate',
      reason:
        'Tax rates are synced into Payhawk from connected ERP / accounting systems; there is no API endpoint to read them back from the Payhawk v3 REST API.',
    },
  ],
} as const
