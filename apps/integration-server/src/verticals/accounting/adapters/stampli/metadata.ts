export const metadata = {
  platform: 'stampli',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'Stampli is an AP-only platform; it has no accounts-receivable invoice concept or endpoint.',
    },
    {
      resource: 'salesorder',
      reason:
        'Stampli is an AP-only platform; sales orders are an AR concept not present in the product.',
    },
    {
      resource: 'creditmemo',
      reason:
        'UNVERIFIED: Credit memos appear in ERP-side export docs but no Stampli partner API endpoint has been confirmed; API docs are behind a partner login.',
    },
    {
      resource: 'expense',
      reason:
        'UNVERIFIED: Stampli Card exists as a product but no expense-report API endpoint has been confirmed; API docs are behind a partner login.',
    },
    {
      resource: 'journal',
      reason:
        'UNVERIFIED: Journal entries are created in the ERP on posting; no Stampli partner API endpoint for journal entries has been confirmed; API docs are behind a partner login.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Generic "order" is not a documented Stampli API resource; API docs are behind a partner login.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'UNVERIFIED: Stampli syncs ERP-owned PO data for matching but no partner API endpoint exposing Stampli-side purchase orders has been confirmed; API docs are behind a partner login.',
    },
    {
      resource: 'taxrate',
      reason:
        'UNVERIFIED: Tax codes are synced from ERP master data but no Stampli partner API endpoint for tax rates as a standalone resource has been confirmed; API docs are behind a partner login.',
    },
  ],
} as const
