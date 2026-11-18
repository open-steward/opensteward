export const metadata = {
  platform: 'built-africa',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'Built Africa has no credit note concept or endpoint; the platform uses invoices and bills exclusively with no documented credit/refund document type.',
    },
    {
      resource: 'order',
      reason: 'Built Africa has no generic order endpoint; the platform exposes invoices and quick sales but no order management lifecycle.',
    },
    {
      resource: 'purchaseorder',
      reason: 'Built Africa has no purchase order endpoint; the platform uses bills for supplier payables with no PO workflow documented.',
    },
    {
      resource: 'salesorder',
      reason: 'Built Africa has no sales order endpoint; the platform uses invoices and quick sales but no pre-invoice sales order stage.',
    },
  ],
} as const
