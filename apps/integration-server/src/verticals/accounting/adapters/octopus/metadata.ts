export const metadata = {
  platform: 'octopus',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'Octopus documents credit notes only as negative-total sales invoices, read under /dossiers/{dossierId}/ with a dossierToken header (https://service.inaras.be/octopus-rest-api/v1/openapi.json); this adapter collects neither and calls no documented path, so the source is unreachable until the connection is rebuilt',
    },
    {
      resource: 'expense',
      reason: 'Octopus REST API has no expense/onkosten endpoint',
    },
    {
      resource: 'order',
      reason: 'Octopus REST API has no generic order endpoint',
    },
    {
      resource: 'purchaseorder',
      reason: 'Octopus REST API has no purchaseOrders endpoint',
    },
    {
      resource: 'salesorder',
      reason: 'Octopus REST API has no salesOrders endpoint',
    },
  ],
} as const
