export const metadata = {
  platform: 'orckestra',
  totalResources: 10,
  availableResources: ['order', 'product', 'customer'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'UNVERIFIED: Orckestra uses product categories as search facets (CategoryLevel1_Facet / CategoryLevel2_Facet) rather than a dedicated collection CRUD endpoint; no /categories listing REST path confirmed in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'discount',
      reason:
        'UNVERIFIED: Orckestra supports price lists with a "Discount" type via PriceListRequest workflow APIs, but no dedicated /discounts or /promotions REST endpoint confirmed in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'fulfillment',
      reason:
        'UNVERIFIED: Orckestra exposes shipment state changes via ChangeShipmentStatusRequest workflow and /fulfillmentLocations timeslot endpoints, but no dedicated /fulfillments listing REST endpoint confirmed in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'inventory',
      reason:
        'UNVERIFIED: Orckestra embeds inventoryLocationStatuses inline in product search responses rather than a standalone inventory endpoint; no /inventory listing REST path confirmed in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'location',
      reason:
        'UNVERIFIED: Orckestra has /fulfillmentLocations used for timeslot reservation management, but no confirmed GET /fulfillmentLocations listing endpoint in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'refund',
      reason:
        'UNVERIFIED: Orckestra V5.4 added a refund API via RefundPaymentRequest payment workflow, but no standalone /refunds REST listing endpoint confirmed in public docs (full API reference requires authenticated portal access).',
    },
    {
      resource: 'transaction',
      reason:
        'UNVERIFIED: Orckestra payment transactions exist as workflow actions (AuthorizePaymentRequest, SettlePaymentOrderRequest, RefundPaymentRequest) but no /transactions REST listing endpoint confirmed in public docs (full API reference requires authenticated portal access).',
    },
  ],
} as const
