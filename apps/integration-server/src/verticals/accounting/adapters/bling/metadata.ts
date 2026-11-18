export const metadata = {
  platform: 'bling',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'organization',
    'purchaseorder',
    'salesorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'Bling v3 has no credit note / credit memo endpoint; the platform does not model this concept separately from invoices',
    },
    {
      resource: 'expense',
      reason: 'Bling v3 has no standalone expense endpoint; categoriasReceitasDespesas is an income/expense category list, not expense records',
    },
    {
      resource: 'journal',
      reason: 'Bling v3 has no lancamentos (journal entry) endpoint in the public API',
    },
    {
      resource: 'order',
      reason: 'Bling has only sales orders (pedidosVendas) and purchase orders (pedidosCompras), both already wired as salesorder/purchaseorder; no unified order resource exists',
    },
  ],
} as const
