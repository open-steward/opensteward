export const metadata = {
  platform: 'innoship',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'The spec\'s Courier paths are only "/api/Courier/RequestPickup" ("Request pickup to courier") and /api/Courier/Location/{GenerateId,List,SetId}/{locationId}/{courierId}; there is no courier collection',
    },
    {
      resource: 'order',
      reason:
        'The v1 spec (https://api.innoship.io/swagger/v1/swagger.json) has only "POST /api/Order" ("Creates a new order") and per-AWB reads (/api/Order/ReturnAwbInfo/{courierId}/{returnAwb}, /api/Order/DownloadDocument/courier/{courierId}/awb/{awb}); neither v1 nor v2 has an order collection',
    },
    {
      resource: 'warehouse',
      reason:
        'GET /api/ClientLocation documents no response body (responses {"200": {"description": "OK"}} in https://api.innoship.io/swagger/v1/swagger.json), and neither does POST /api/ClientLocation/Summary, so their rows cannot be mapped without guessing field names',
    },
  ],
} as const
