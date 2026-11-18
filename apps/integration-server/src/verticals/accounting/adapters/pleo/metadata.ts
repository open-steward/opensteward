export const metadata = {
  platform: 'pleo',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'expense',
    'organization',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'Pleo REST API v1 (confirmed via api.pleo.io/rest/v3/swagger.json) has no bill/accounts-payable endpoint. Pleo is a spend-management platform; supplier invoices are uploaded as expenses, not as a separate bill resource.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Pleo REST API v1 has no credit-memo or credit-note endpoint. The platform does not expose accounts-receivable credit documents via its public API.',
    },
    {
      resource: 'invoice',
      reason:
        'Pleo REST API v1 has no customer-invoice endpoint. Supplier invoices uploaded to Pleo are modelled as expenses (GET /expenses), not as a dedicated invoice resource.',
    },
    {
      resource: 'journal',
      reason:
        'Pleo REST API v1 has no journal-entry endpoint. Accounting journal data is only accessible through the separate Export API (external.pleo.io/v2/export-jobs), which requires a different auth flow and is not part of the openapi.pleo.io v1 surface.',
    },
    {
      resource: 'order',
      reason:
        'Pleo REST API v1 has no order endpoint. Pleo is a corporate card and spend-management platform with no order-management concept.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Pleo REST API v1 has no purchase-order endpoint. The platform has no purchase-order concept in its public API.',
    },
    {
      resource: 'salesorder',
      reason:
        'Pleo REST API v1 has no sales-order endpoint. The platform has no sales-order concept in its public API.',
    },
    {
      resource: 'transaction',
      reason:
        'Pleo REST API v1 has no generic transaction endpoint. Card transactions are surfaced as expenses (GET /expenses); raw ledger transactions are only available via the Export API (external.pleo.io), not the openapi.pleo.io v1 surface.',
    },
  ],
} as const
