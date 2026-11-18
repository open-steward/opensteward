/**
 * The "Sample Response Payload" of
 * https://api-docs.routific.com/reference/fetch-order.md (GET
 * https://api.plan.routific.com/v2/orders/{orderUuid}), with the invalid
 * trailing comma in its customFields removed and the signature string cut.
 */
import type { RoutificOrder } from '../../../../../../src/verticals/logistics/adapters/routific/transform/order'

export function documentedOrder(o: Partial<RoutificOrder> = {}): RoutificOrder {
  return {
    name: 'Metro',
    email: 'metro@routific.com',
    phone: '16043215582',
    load: 1,
    duration: 600,
    instructions: 'Deliver at loading bay at the back of the building.',
    createdOn: '2023-06-13T23:50:54.758Z',
    uuid: '9a3e5d87-a448-4125-a165-2b8a689322ab',
    customerOrderNumber: 'external-1',
    routificOrderNumber: 'ORD-1655',
    timeWindows: [{ startTime: '09:00', endTime: '10:00' }],
    locations: [
      {
        address: '510 W 8th Ave, Vancouver, BC V5Z 1C5, Canada',
        latitude: 49.26413,
        longitude: -123.11499,
        timezone: 'America/Vancouver',
        status: 'Validated',
      },
    ],
    workspaceId: 1,
    status: 'missed',
    deliveryDate: '2025-12-25',
    deliveryMissedReason: 'nobody home!',
    deliveryTime: '2023-06-14T23:50:54.758Z',
    packages: [{ barcode: 'ref-10000' }],
    tags: ['refrigerated'],
    customFields: { 'Total Cost': '121.34', 'VIP Customer': 'yes' },
    deliveryTracking: {
      url: 'https://tracking.routific.com/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      shortUrl: 'https://routi.fi/3Gy6dTLA',
    },
    proofOfDelivery: {
      signature:
        'iVBORw0KGgoAAAANSUhEUgAAAfYAAABxCAYAAAAnKYFoAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAACAA....',
      photos: [
        '/v1/orders/a09d0e3b-4a3a-4598-9f8f-5fb5350faae5/photos/57c7387e-5daa-4f17-8924-b53ab41e6',
      ],
    },
    ...o,
  }
}
