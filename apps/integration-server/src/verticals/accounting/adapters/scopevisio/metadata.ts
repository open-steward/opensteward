export const metadata = {
  platform: 'scopevisio',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'journal',
    'order',
    'organization',
    'salesorder',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        'Scopevisio OpenScope REST API has no expense/Spesen endpoint; confirmed absent from the published swagger.json path list and the generated OpenApi client.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Scopevisio OpenScope REST API has no purchase-order endpoint; the /orders endpoint represents sales orders (Aufträge), and no Bestellung/Einkaufsbestellung resource exists in the API.',
    },
    {
      resource: 'taxrate',
      reason:
        'Scopevisio OpenScope REST API has no standalone tax-rate resource; VAT codes (Steuerkennzeichen) are embedded as fields on account records but are not exposed as a queryable collection.',
    },
    {
      resource: 'transaction',
      reason:
        'Scopevisio OpenScope REST API has no generic transaction endpoint; posting rows are available via /journal (used for journals) and cashbook entries via /cashbooksheets, but neither maps cleanly to the canonical Transaction resource without fabricating an endpoint.',
    },
  ],
} as const
