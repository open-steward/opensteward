export const metadata = {
  platform: 'nimbuspost',
  totalResources: 8,
  availableResources: ['carrier', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'No dedicated label endpoint exists in the NimbusPost API; labels are accessible only as a label_url field on shipment objects with no independent list/get/create/void operations',
    },
    {
      resource: 'order',
      reason:
        'The only documented orders list is GET https://ship.nimbuspost.com/api/orders (Ship API, NP-API-KEY), whose docs say only "This API will list orders from your Nimbuspost account." and give no response fields or example, so its rows cannot be mapped',
    },
    {
      resource: 'warehouse',
      reason:
        'The only documented list is GET https://ship.nimbuspost.com/api/warehouse (Ship API, NP-API-KEY), whose docs say only "This API will list all warehouses from your Nimbuspost account." and give no response fields or example, so its rows cannot be mapped',
    },
  ],
} as const
