export const metadata = {
  platform: 'crater',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'expense',
    'invoice',
    'order',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'Crater has no bill/AP resource; the platform is invoice-only and its API exposes no bills endpoint (confirmed via routes/api.php and docs.crater.financial).',
    },
    {
      resource: 'creditmemo',
      reason:
        'Crater has no credit memo concept; neither the open-source routes nor the hosted API reference include any credit note or credit memo endpoint.',
    },
    {
      resource: 'journal',
      reason:
        'Crater has no journal-entry resource; the platform does not expose double-entry bookkeeping or journal endpoints.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Crater has no purchase order resource; the API covers invoices and estimates only, with no PO endpoint in routes/api.php or the hosted API reference.',
    },
    {
      resource: 'salesorder',
      reason:
        'Crater has no sales order resource; estimates are the closest concept and are already mapped to the order resource.',
    },
  ],
} as const
