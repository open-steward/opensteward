export const metadata = {
  platform: 'hongkong-post',
  totalResources: 8,
  availableResources: ['trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Hong Kong Post is itself a single national postal carrier; no carrier-management REST endpoint exists in the /v1/ API.',
    },
    {
      resource: 'label',
      reason:
        'Label generation (getAddressPack) is exposed only via SOAP (EC-Ship API); the public REST /v1/ API does not offer a label endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest concept exists in either the EC-Ship SOAP API or the REST /v1/ API.',
    },
    {
      resource: 'order',
      reason:
        'Order operations (createOrder, getOrderInfo) are SOAP-only (EC-Ship API); not available via the REST /v1/ endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'Postage calculation (getTotalPostage) is SOAP-only (EC-Ship Postage API); not available via the REST /v1/ endpoint.',
    },
    {
      resource: 'shipment',
      reason:
        'No shipment resource exists in the REST /v1/ API; all shipment operations are SOAP-only.',
    },
    {
      resource: 'warehouse',
      reason:
        'Hong Kong Post is a postal service with no warehouse management API (REST or SOAP).',
    },
  ],
} as const
