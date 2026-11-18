export const metadata = {
  platform: 'wfirma',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'wFirma has no chart-of-accounts ledger API; the companyaccounts module covers bank accounts only, not a full Account type',
    },
    {
      resource: 'expense',
      reason:
        'wFirma has no employee expense-report concept; its /expenses module is supplier purchase invoices already mapped to Bill',
    },
    {
      resource: 'journal',
      reason: 'No journal entries endpoint exists in the wFirma v2 API',
    },
    {
      resource: 'order',
      reason: 'No generic orders endpoint exists in the wFirma v2 API',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase orders endpoint exists in the wFirma v2 API',
    },
    {
      resource: 'salesorder',
      reason: 'No sales orders endpoint exists in the wFirma v2 API',
    },
  ],
} as const
