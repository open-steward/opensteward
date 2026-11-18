export const metadata = {
  platform: 'mezan',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'journal',
    'organization',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        "UNVERIFIED: Mezan has a 'General Receipts' module that maps conceptually to expenses, but no public REST API endpoint is documented; the private API (Advanced plan) does not expose a known path for this resource.",
    },
    {
      resource: 'order',
      reason:
        "UNVERIFIED: Mezan has no 'order' concept distinct from invoices or quotations; no public REST API endpoint is documented for a generic order resource.",
    },
    {
      resource: 'purchaseorder',
      reason:
        "UNVERIFIED: Mezan has a Purchase Orders module (documented in user-facing docs), but no public REST API endpoint path is available to confirm the resource is accessible via API.",
    },
    {
      resource: 'salesorder',
      reason:
        "UNVERIFIED: Mezan has Sales Quotations (which don't generate transactions) but no 'sales order' resource distinct from sales invoices; no public REST API endpoint is documented.",
    },
    {
      resource: 'transaction',
      reason:
        "UNVERIFIED: Mezan generates ledger transactions from all modules but exposes no dedicated public REST API endpoint for querying raw transactions; the private API does not document this resource.",
    },
  ],
} as const
