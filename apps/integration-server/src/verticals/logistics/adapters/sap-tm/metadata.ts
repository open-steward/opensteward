export const metadata = {
  platform: 'sap-tm',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'UNVERIFIED: SAP TM does have a label-print concept (output profiles on freight orders), but the SAP Business Accelerator Hub API portal requires authentication and no public REST endpoint path for /labels is documented; cannot confirm endpoint or response shape.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: SAP TM has a pickup-closeout/manifest concept in its freight-order workflow, but the SAP Business Accelerator Hub API portal requires authentication and no public REST endpoint path for /manifests is documented; cannot confirm endpoint or response shape.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: SAP TM has a rate-determination engine for freight charges, but the SAP Business Accelerator Hub API portal requires authentication and no public REST endpoint path for /rates is documented; cannot confirm endpoint or response shape.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: SAP TM integrates with SAP eWM for warehouse operations, but the SAP Business Accelerator Hub API portal requires authentication and no public REST endpoint path for /warehouses is documented; cannot confirm endpoint or response shape.',
    },
  ],
} as const
