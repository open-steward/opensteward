export const metadata = {
  platform: 'woocommerce',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'WooCommerce core v3 REST API has no fulfillment or shipment-tracking endpoint; ' +
        'shipment tracking requires the separate paid "WooCommerce Shipment Tracking" plugin ' +
        '(namespace wc-shipment-tracking/v3, not wc/v3).',
    },
    {
      resource: 'location',
      reason:
        'WooCommerce core v3 REST API has no stock or fulfillment location resource; the only ' +
        '"locations" endpoint (/wc/v3/shipping/zones/{id}/locations) is shipping-zone geography, ' +
        'not a warehouse/location entity, and stock is a field on each product/variation.',
    },
    {
      resource: 'transaction',
      reason:
        'WooCommerce core v3 REST API exposes no payment transaction records; ' +
        'transaction-level data requires the WooCommerce Payments extension or a third-party ' +
        'payment gateway plugin and is not available in the standard wc/v3 namespace.',
    },
  ],
} as const
