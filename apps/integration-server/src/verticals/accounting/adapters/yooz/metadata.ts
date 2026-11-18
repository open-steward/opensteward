export const metadata = {
  platform: 'yooz',
  totalResources: 13,
  availableResources: ['bill', 'contact', 'organization'],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Yooz is an AP-only automation platform with no chart-of-accounts REST endpoint; chart of accounts is imported into Yooz via CSV file, not readable via API.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Yooz has no accounts-receivable module; credit memos (AR credit notes) are not a supported concept in the Yooz Rising REST API.',
    },
    {
      resource: 'expense',
      reason:
        'Yooz does not have an employee-expense module; there is no expenses endpoint in the Yooz Rising REST API.',
    },
    {
      resource: 'invoice',
      reason:
        'Yooz is AP-only; it has no accounts-receivable invoice module and no GET /invoices endpoint in the Yooz Rising REST API.',
    },
    {
      resource: 'journal',
      reason:
        'Yooz exports accounting entries to an ERP as files (CSV/XML) via export configurations; there is no readable journal-entry REST endpoint.',
    },
    {
      resource: 'order',
      reason:
        'Yooz does not expose a generic order resource; the concept does not exist in the Yooz Rising REST API.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Purchase orders can only be imported into Yooz via a write-only CSV POST endpoint (/orgUnits/{code}/importPurchaseOrders); there is no GET endpoint to retrieve POs.',
    },
    {
      resource: 'salesorder',
      reason:
        'Yooz is AP-only; sales orders are not a supported concept in the Yooz Rising REST API.',
    },
    {
      resource: 'taxrate',
      reason:
        'Tax codes are imported into Yooz via CSV file as master data; there is no readable tax-rate REST endpoint in the Yooz Rising API.',
    },
    {
      resource: 'transaction',
      reason:
        'Yooz does not expose ledger transactions via REST; accounting entries are exported to the ERP as files, not queryable as transaction records.',
    },
  ],
} as const
