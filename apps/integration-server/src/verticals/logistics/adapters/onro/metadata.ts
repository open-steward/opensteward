export const metadata = {
  platform: 'onro',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Onro is a single-carrier last-mile platform with no external carrier management API' },
    { resource: 'manifest', reason: 'Hub scanning is a UI-only feature; no public manifest API endpoint is documented' },
    { resource: 'label', reason: 'UNVERIFIED: Label creation is mentioned in Shopify app listing but Postman API docs are JS-rendered and endpoint/fields could not be confirmed' },
    { resource: 'rate', reason: 'UNVERIFIED: Pricing rules exist in the platform but Postman API docs are JS-rendered and rate endpoint could not be confirmed' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Hub/warehouse concept exists but Postman API docs are JS-rendered and warehouse endpoint could not be confirmed' },
  ],
} as const
