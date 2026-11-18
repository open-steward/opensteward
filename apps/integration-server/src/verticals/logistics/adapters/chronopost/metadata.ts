export const metadata = {
  platform: 'chronopost',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Chronopost\'s public REST API (api.chronopost.fr) has no documented carrier-list endpoint; only SOAP (ws.chronopost.fr) is publicly documented and it has no carrier enumeration operation.',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Label creation is embedded in shipment creation (label_url returned); no dedicated REST label-list or get-label endpoint is publicly documented for api.chronopost.fr.',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: No manifest/bordereau endpoint exists in the publicly documented Chronopost SOAP or REST APIs.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Chronopost is a shipping carrier only; no order management endpoint is documented in any public API.',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Rate quoting exists via SOAP (ws.chronopost.fr/quickcost-cxf/QuickcostServiceWS) but no REST rate endpoint is documented for api.chronopost.fr, and the adapter uses a REST client.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Chronopost\'s PointRelais SOAP service lists customer pickup points, not warehouses/fulfillment centers; no warehouse endpoint exists in any documented API.',
    },
  ],
} as const
