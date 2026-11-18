export const metadata = {
  platform: 'yayoi',
  totalResources: 13,
  availableResources: ['contact', 'invoice', 'order', 'organization'],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Misoca (Yayoi) is an invoicing/quotation platform with no chart-of-accounts or ledger concepts; no /accounts endpoint exists in the v3 API.',
    },
    {
      resource: 'bill',
      reason:
        'Misoca has no supplier-bill concept; no /bills endpoint exists in the v3 API.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Misoca has no credit-note or credit-memo concept; no /credit_memos endpoint exists in the v3 API.',
    },
    {
      resource: 'expense',
      reason:
        'Misoca has no expense-claim or reimbursement concept; no /expenses endpoint exists in the v3 API.',
    },
    {
      resource: 'journal',
      reason:
        'Misoca has no double-entry journal concept; no /journals endpoint exists in the v3 API.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Misoca has no purchase-order concept; no /purchase_orders endpoint exists in the v3 API.',
    },
    {
      resource: 'salesorder',
      reason:
        'Misoca has no sales-order concept distinct from estimates/invoices; no /sales_orders endpoint exists in the v3 API.',
    },
    {
      resource: 'taxrate',
      reason:
        'Misoca embeds tax type as a per-line-item enum on invoices/estimates; there is no standalone /tax_rates resource in the v3 API.',
    },
    {
      resource: 'transaction',
      reason:
        'Misoca has no ledger-transaction concept; no /transactions endpoint exists in the v3 API.',
    },
  ],
} as const
