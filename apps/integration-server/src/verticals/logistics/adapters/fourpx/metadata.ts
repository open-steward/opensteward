export const metadata = {
  platform: 'fourpx',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: ds.xms.logistics_product.getlist exists on the open.4px.com RPC platform but the REST path on openapi.4px.com is inaccessible without a partner account; cannot confirm endpoint shape',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: ds.xms.label.get/bws.package.getLabel exist on the open.4px.com RPC platform but the REST path on openapi.4px.com is inaccessible without a partner account; cannot confirm endpoint shape',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept found in any 4PX API documentation; 4PX has no manifest submission endpoint',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: ds.xms.order.create/get exist on the open.4px.com RPC platform but the REST path on openapi.4px.com is inaccessible without a partner account; cannot confirm endpoint shape',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse query API found in 4PX documentation; 4PX operates fulfillment centers but provides no endpoint to enumerate them',
    },
  ],
} as const
