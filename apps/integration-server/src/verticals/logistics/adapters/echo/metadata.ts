export const metadata = {
  platform: 'echo',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Echo Global Logistics API documentation (echo.com/technology/integrations/echosync/documentation/ and api-docs.echo.com) is behind authentication and could not be accessed; no public endpoint for /carriers confirmed.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Echo Global Logistics API documentation is behind authentication and could not be accessed; Echo is a freight broker (LTL/FTL) so parcel-style label generation may not apply, but this could not be confirmed from public docs.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Echo Global Logistics API documentation is behind authentication and could not be accessed; no public endpoint for /manifests confirmed.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Echo Global Logistics API documentation is behind authentication and could not be accessed; no public endpoint for /orders confirmed.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Echo Global Logistics API documentation is behind authentication and could not be accessed; no public endpoint for /warehouses confirmed.',
    },
  ],
} as const
