export const metadata = {
  platform: 'gd-express',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'GD Express is a single-carrier network; the myGDEX Open API exposes no carrier-listing endpoint — the carrier identity is a static constant',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: myGDEX Open API portal (myopenplatform.gdexpress.com) requires subscription and authenticated access; consignment note creation is documented but the exact label-metadata endpoint path and JSON response shape could not be confirmed from public sources',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: myGDEX Open API portal (myopenplatform.gdexpress.com) requires subscription and authenticated access; no manifest endpoint was found in public documentation',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: myGDEX Open API portal (myopenplatform.gdexpress.com) requires subscription and authenticated access; no order management endpoint was found in public documentation',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: myGDEX Open API portal (myopenplatform.gdexpress.com) requires subscription and authenticated access; no warehouse endpoint was found in public documentation',
    },
  ],
} as const
