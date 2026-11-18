export const metadata = {
  platform: 'neurored',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a carrier object cannot be confirmed without authenticated access to a live org.',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a label object cannot be confirmed without authenticated access to a live org.',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a manifest object cannot be confirmed without authenticated access to a live org.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a transport order object cannot be confirmed without authenticated access to a live org.',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a rate/quote object cannot be confirmed without authenticated access to a live org.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Neurored custom object schema is not publicly documented; the Salesforce API names and field list for a warehouse object cannot be confirmed without authenticated access to a live org.',
    },
  ],
} as const
