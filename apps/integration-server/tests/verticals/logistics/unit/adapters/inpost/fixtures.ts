/**
 * Fixtures copied from the ShipX documentation examples.
 *
 * - Services: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153486/
 * - DispatchOrder details: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153482/
 * - Tracking: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153479/
 */
import type { InPostServiceItem } from '../../../../../../src/verticals/logistics/adapters/inpost/transform/carrier'
import type { InPostDispatchOrderResponse } from '../../../../../../src/verticals/logistics/adapters/inpost/transform/manifest'
import type { InPostTrackingResponse } from '../../../../../../src/verticals/logistics/adapters/inpost/transform/tracking'

/** The first two entries of the documented `GET /v1/services` response. */
export const SERVICES: InPostServiceItem[] = [
  {
    id: 'inpost_locker_standard',
    name: 'Paczkomatowa standardowa',
    description: 'Przesyłka paczkomatowa standardowa',
    additional_services: [
      { id: 'insurance', name: 'Ubezpieczenie', description: 'Ubezpieczenie przesyłki' },
      { id: 'cod', name: 'Pobranie', description: 'Pobranie za przesyłkę' },
      { id: 'labelless', name: 'Przesyłka bez etykiety', description: 'Przesyłka bez etykiety' },
      {
        id: 'end_of_week_collection',
        name: 'Dostawa weekendowa',
        description: 'Weekendowa dostawa przesyłki',
      },
    ],
  },
  {
    id: 'inpost_locker_economy',
    name: 'Paczkomatowa ekonomiczna',
    description: 'Przesyłka paczkomatowa ekonomiczna',
    additional_services: [
      { id: 'insurance', name: 'Ubezpieczenie', description: 'Ubezpieczenie przesyłki' },
      { id: 'cod', name: 'Pobranie', description: 'Pobranie za przesyłkę' },
    ],
  },
]

/** The documented `GET /v1/dispatch_orders/:id` response. */
export function dispatchOrder(
  overrides: Partial<InPostDispatchOrderResponse> = {},
): InPostDispatchOrderResponse {
  return {
    href: 'https://api-shipx-pl.easypack24.net/v1/dispatch_orders/3223738',
    id: 3223738,
    status: 'sent',
    external_id: 2003222292,
    price: null,
    address: {
      id: 1192036131,
      street: 'Malborska',
      building_number: '130',
      line1: null,
      line2: null,
      city: 'Krakow',
      post_code: '31-209',
      country_code: 'PL',
    },
    statuses: [],
    shipments: [
      {
        href: 'https://api-shipx-pl.easypack24.net/v1/shipments/793374228',
        id: 793374228,
        tracking_number: '602677358231630337744964',
      },
    ],
    comments: [
      {
        id: 3198262,
        comment: 'Dowolny komentarz do zlecenia odbioru',
        created_at: '2022-05-27T10:15:31.765+02:00',
      },
    ],
    created_at: '2022-05-27T10:15:31.756+02:00',
    updated_at: '2022-05-27T10:15:32.122+02:00',
    ...overrides,
  }
}

/** The documented `GET /v1/tracking/:tracking_number` response (first three details). */
export function tracking(overrides: Partial<InPostTrackingResponse> = {}): InPostTrackingResponse {
  return {
    tracking_number: '632085946340007012341234',
    service: 'inpost_locker_standard',
    type: 'inpost_locker_standard',
    status: 'delivered',
    custom_attributes: { size: 'A', target_machine_id: 'KAT07A' },
    tracking_details: [
      {
        origin_status: 'DOR',
        status: 'delivered',
        agency: null,
        datetime: '2023-12-18T11:20:06.000+01:00',
      },
      {
        origin_status: 'UWP',
        status: 'ready_to_pickup',
        agency: null,
        datetime: '2023-12-18T10:14:01.000+01:00',
      },
      {
        origin_status: 'PDD_2',
        status: 'out_for_delivery',
        agency: null,
        datetime: '2023-12-18T08:37:45.000+01:00',
      },
    ],
    expected_flow: [],
    created_at: '2023-12-17T12:58:39.539+01:00',
    updated_at: '2023-12-18T11:20:07.005+01:00',
    ...overrides,
  }
}
