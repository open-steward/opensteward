export const metadata = {
  platform: 'campfire',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'journal',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    { resource: 'expense', reason: 'Campfire has no expense or receipt tracking endpoint' },
    { resource: 'order', reason: 'Campfire has no generic order endpoint' },
    { resource: 'purchaseorder', reason: 'Campfire has no purchase order endpoint' },
    { resource: 'salesorder', reason: 'Campfire has no sales order endpoint' },
    { resource: 'taxrate', reason: 'Campfire has no tax rate endpoint' },
  ],
} as const
