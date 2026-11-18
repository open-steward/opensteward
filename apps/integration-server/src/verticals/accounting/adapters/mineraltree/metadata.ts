export const metadata = {
  platform: 'mineraltree',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'organization',
    'purchaseorder',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason:
        'MineralTree is AP-only; no AR invoicing concept or endpoint exists (confirmed: Core MineralTree API User Guide v5.28).',
    },
    {
      resource: 'journal',
      reason:
        'No journal entry endpoint; MT writes directly to the connected ERP GL — there is no native journal API.',
    },
    {
      resource: 'expense',
      reason:
        'No employee expense concept or endpoint; MineralTree handles vendor AP only, not employee spend.',
    },
    {
      resource: 'order',
      reason:
        'No generic order concept or endpoint in the MineralTree API (confirmed: Core MineralTree API User Guide v5.28).',
    },
    {
      resource: 'salesorder',
      reason:
        'MineralTree is AP-only; no sales order concept or endpoint exists (confirmed: Core MineralTree API User Guide v5.28).',
    },
    {
      resource: 'taxrate',
      reason:
        'No tax rate endpoint; tax handling is delegated entirely to the connected ERP.',
    },
  ],
} as const
