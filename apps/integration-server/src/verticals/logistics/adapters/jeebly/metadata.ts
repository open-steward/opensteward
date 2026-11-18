export const metadata = {
  platform: 'jeebly',
  totalResources: 8,
  availableResources: ['shipment', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Jeebly is a single-carrier MENA last-mile platform; no carrier management endpoints exist in the API',
    },
    {
      resource: 'warehouse',
      reason: 'Jeebly has no warehouse or fulfillment-centre endpoints',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: ClickPost references a Manifestation and Label Generation API for Jeebly but the Swagger UI (rest.jeeblynow.com) requires authentication and response field names cannot be confirmed from publicly accessible documentation',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Same blocker as label — endpoint hinted by ClickPost integration page but Jeebly Swagger UI requires authentication and no public field-level schema is available',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: No rate or pricing endpoint found in any publicly accessible Jeebly documentation; Swagger UI requires authentication',
    },
    {
      resource: 'trackingevent',
      reason:
        'The published spec (https://rest.jeeblynow.com/api/v1/integrations/swagger/) has only PATCH /api/v1/integrations/api_order_update/{slug}, POST /api/v1/integrations/generate_token, GET /api/v1/integrations/order/cancel/{slug}, PATCH /api/v1/integrations/order/cancel_v2/{slug}, PATCH /api/v1/integrations/order/return/{slug} and POST /api/v1/integrations/order_location_wise; none lists or reads shipments, orders or tracking',
    },
  ],
} as const
