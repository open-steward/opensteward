export const metadata = {
  platform: 'mabang-erp',
  totalResources: 7,
  availableResources: [
    'product',
    'stock-level',
    'purchase-order',
    'stock-adjustment',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Mabang ERP Open API exposes no warehouse listing endpoint; warehouse name/code only appear as fields on stock-log records.',
    },
    {
      resource: 'supplier',
      reason:
        'Mabang ERP Open API has no supplier list or search endpoint; only do-add-provider (create) and get-add-provider-option (create prerequisites) are documented.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Mabang ERP Open API has no inter-warehouse transfer listing endpoint; the warehouse API covers only in/out logs, purchase storage, and inventory counts.',
    },
  ],
} as const
