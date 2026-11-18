export const metadata = {
  platform: 'intelipost',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'label',
    'rate',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: no public carrier-list endpoint found in any SDK or public docs; docs.intelipost.com.br requires login to browse full API reference',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: pre_shipment_list write endpoint (POST /pre_shipment_list/send_volumes) exists in the Java SDK but response shape and list/get endpoints are not confirmed; docs behind Stoplight login',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: no public warehouse-list endpoint found in any SDK or public docs; warehouses are referenced only as origin_warehouse_code field on shipment orders',
    },
  ],
} as const
