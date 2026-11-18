export const metadata = {
  platform: 'granatum',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'transaction',
  ],
  unavailableResources: [
    { resource: 'creditmemo', reason: 'Granatum API has no credit memo / nota de crédito endpoint; confirmed absent from official docs at static.granatum.com.br/financeiro/api/' },
    { resource: 'expense', reason: 'Granatum has no separate employee-expense resource; payable lancamentos are mapped to bill instead' },
    { resource: 'journal', reason: 'Granatum API has no double-entry journal / lançamento contábil endpoint; confirmed absent from official docs' },
    { resource: 'order', reason: 'Granatum API has no order / pedido endpoint; confirmed absent from official docs' },
    { resource: 'organization', reason: 'Granatum API has no organization / empresa endpoint; confirmed absent from official docs' },
    { resource: 'purchaseorder', reason: 'Granatum API has no purchase order endpoint; confirmed absent from official docs' },
    { resource: 'salesorder', reason: 'Granatum API has no sales order endpoint; confirmed absent from official docs' },
    { resource: 'taxrate', reason: 'Granatum API has no tax rate / alíquota endpoint; confirmed absent from official docs' },
  ],
} as const
