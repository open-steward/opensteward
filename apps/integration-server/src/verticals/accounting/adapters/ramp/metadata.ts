export const metadata = {
  platform: 'ramp',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'organization',
    'purchaseorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    { resource: 'creditmemo', reason: 'Ramp is AP/spend-only; no credit memo concept or endpoint exists in the API' },
    { resource: 'invoice', reason: 'Ramp is AP/spend-only; no AR invoice endpoint exists in the API' },
    { resource: 'journal', reason: 'No journal entry endpoint in the Ramp Developer API v1' },
    { resource: 'order', reason: 'No generic order endpoint in the Ramp Developer API v1' },
    { resource: 'salesorder', reason: 'Ramp has no sales order concept; no endpoint exists in the API' },
  ],
} as const
