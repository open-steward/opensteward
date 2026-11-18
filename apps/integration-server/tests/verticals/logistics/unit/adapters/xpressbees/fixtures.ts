/**
 * Response bodies copied from the first-party Xpressbees Postman collection
 * (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT; JSON at
 * https://documenter.gw.postman.com/api/collections/15188467/2s9YyzcxWT?segregateAuth=true&versionTag=latest).
 */

/** "Courier List" 200 example. */
export const docCourierList = {
  status: true,
  data: [
    { id: '6', name: 'Air Xpressbees 0.5 K.G' },
    { id: '8', name: 'Express Reverse' },
    { id: '1', name: 'Surface Xpressbees 0.5 K.G' },
    { id: '12298', name: 'Xpressbees 1 K.G' },
    { id: '4', name: 'Xpressbees 10 K.G' },
    { id: '2', name: 'Xpressbees 2 K.G' },
    { id: '3', name: 'Xpressbees 5 K.G' },
    { id: '12939', name: 'Xpressbees Next Day Delivery' },
    { id: '12938', name: 'Xpressbees Same Day Delivery' },
  ],
}

/** "Track Shipment" 200 example ("Shipments Track"). */
export const docTrack = {
  status: true,
  data: {
    id: '9590285',
    order_id: '19177931',
    order_number: '#001',
    created: '2024-02-09',
    awb_number: '14344940342223',
    courier_id: '1',
    warehouse_id: '203199',
    rto_warehouse_id: '203199',
    status: 'pending pickup',
    shipment_info: '',
    history: [
      {
        status_code: 'PP',
        location: 'Muzaffarnagar, Muzaffarnagar, UTTAR PRADESH',
        event_time: '2024-02-10 00:40',
        message: 'Out For Pickup',
      },
      {
        status_code: 'PP',
        location: 'Muzaffarnagar, Muzaffarnagar, UTTAR PRADESH',
        event_time: '2024-02-09 18:56',
        message: 'Data Received',
      },
    ],
  },
}

/**
 * "Generate Token" 200 example, verbatim. Its payload decodes to
 * `{"iat":1707482057, ..., "exp":1707492857, ...}`: three hours apart.
 */
export const docLogin = {
  status: true,
  data: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3MDc0ODIwNTcsImp0aSI6IjlyVVA5cGRRcm1QYTM5K0kwVEhWXC94Ujd6NkI4RTNqRzhkNnI5OTdRZ2dvPSIsIm5iZiI6MTcwNzQ4MjA1NywiZXhwIjoxNzA3NDkyODU3LCJkYXRhIjp7InVzZXJfaWQiOiI3MDczNSIsInBhcmVudF9pZCI6IjAiLCJlbWFpbCI6ImRlbW9AeHByZXNzYmVlcy5jb20ifX0.oTz0UOquBNImPbJu4WO-i7h0m9XZJJ0GPfHpq1qz0JxpdNqSRvU8suY9asWvNZBC9m1k_AP9P3tbZVDF3cUroQ',
}
/** The documented sample token's `exp` claim (1707492857), as a Date. */
export const docLoginExpiresAt = new Date(1707492857 * 1000)

/** "Generate Token" 401 example. */
export const docLoginRefused = { status: false, message: 'Invalid email or password' }
