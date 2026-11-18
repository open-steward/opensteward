/**
 * Fixtures copied from the OptimoRoute WS API reference, https://optimoroute.com/api/
 * (v1.37): "Search Orders" → "Response example with includeOrderData", and
 * "Get Orders (bulk)" → "Response example".
 */
import type {
  OptimorouteOrderRecord,
  OptimorouteSearchOrdersResponse,
} from '../../../../../../../src/verticals/logistics/adapters/optimoroute/transform/order'

/** The single order of the documented search_orders example, verbatim. */
export const SEARCH_ORDER_DATA: OptimorouteOrderRecord = {
  orderNo: '10205',
  date: '2022-01-03',
  type: 'T',
  priority: 'M',
  duration: 75,
  notes: '',
  email: '',
  phone: '',
  load1: 0,
  load2: 0,
  load3: 0,
  load4: 0,
  customField1: 'Revision 5',
  customField2: '184.5',
  customField3: '',
  customField4: '',
  customField5: '',
  id: 'cd013f61ad8155802ad4321f2b411f4f',
  assignedTo: null,
  location: {
    locationNo: 'T1275',
    locationName: 'T1275',
    address: 'Moneta, VA 24121, United States',
    latitude: 37.2636426,
    longitude: -79.6105659,
    notes: '',
    valid: true,
    checkInTime: 0,
  },
  skills: ['VA'],
  vehicleFeatures: [],
  timeWindows: [],
  notificationPreference: 'dont_notify',
  allowedWeekdays: ['mon', 'tue', 'wed', 'thu'],
  allowedDates: {},
}

export const SEARCH_ORDERS_RESPONSE: OptimorouteSearchOrdersResponse = {
  success: true,
  orders: [{ id: 'cd013f61ad8155802ad4321f2b411f4f', data: SEARCH_ORDER_DATA }],
}

/** The first order of the documented get_orders example, verbatim. */
export const GET_ORDER_DATA: OptimorouteOrderRecord = {
  orderNo: 'ORD001',
  id: '04e7b09e993e8488024f46aaf9d8c72d',
  date: '2018-11-12',
  duration: 60,
  priority: 'M',
  type: 'T',
  load1: 1,
  load2: 0,
  load3: 0,
  load4: 0,
  assignedTo: { externalId: 'DRV001', serial: '001' },
  location: {
    locationNo: 'LOC001',
    address: '393 Hanover St, Boston, MA 02113, USA',
    locationName: 'Green Cross Pharmacy North End',
    latitude: 42.365142,
    longitude: -71.052882,
    checkInTime: 0,
    notes: '',
  },
  timeWindows: [{ twFrom: '11:00', twTo: '17:00' }],
  allowedWeekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  allowedDates: {},
  skills: ['SK001'],
  vehicleFeatures: [],
  notes: '',
  email: '',
  phone: '',
  customField1: '',
  customField2: '',
  customField3: '',
  customField4: '',
  customField5: '',
  notificationPreference: 'email',
}
