/**
 * Terminal Africa v1 shipment objects, copied from the first-party examples.
 *
 * DRAFT_SHIPMENT: the `data[0]` of GET /v1/shipments,
 * https://docs.terminal.africa/tship/shipment/get-shipments.md (addresses
 * populated, `events: []`, alpha-3 `country: 'NGA'` as printed there). The
 * example's parcel item `value: 25000'` is a typo in the docs and is a string here.
 *
 * CONFIRMED_SHIPMENT: the `shipment` embedded in GET /v1/insurance/:id,
 * https://docs.terminal.africa/tship/insurance/get-insurance.md (address and
 * parcel ids unpopulated, `carrier` id, `extras`, one event), trimmed of its
 * carrier-payload `metadata`.
 */
import type { TerminalAfricaShipment } from '../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/shipment'

const OBI = {
  address_id: 'AD-00632494667',
  city: 'Lagos',
  coordinates: { lat: 6.5969424, lng: 3.3542992 },
  country: 'NGA',
  email: 'augustus_obi@shipmonk.ng',
  first_name: 'Augustus',
  id: 'd799c2679e644279b59fe661ac8fa488',
  is_residential: true,
  last_name: 'Obi',
  line1: '1121 Allen Avenue, Ikeja',
  line2: '',
  metadata: { my_app_customer_id: 11234 },
  name: 'Augustus Obi',
  phone: '+2348122340000',
  state: 'Lagos',
  zip: '121006',
}

export function draftShipment(): TerminalAfricaShipment {
  return {
    address_from: { ...OBI },
    address_return: { ...OBI },
    address_to: {
      address_id: 'AD-95918335217',
      city: 'London',
      coordinates: { lat: 43.653226, lng: -79.3831843 },
      country: 'GBR',
      email: 'timothy@shipmonk.ng',
      first_name: 'Timothy',
      id: 'S3YLVnGo9eKpMMbEQcWjgCraLqnNY2Oy',
      is_residential: true,
      last_name: 'Odunubi',
      line1: '45 Greenwich Lane, London',
      line2: '',
      metadata: { my_app_customer_id: 10567 },
      name: 'Timothy Odunubi',
      phone: '+447514022567',
      state: '',
      zip: 'SE5 4HB',
    },
    events: [],
    id: 'BUbL05Ecprhc2q17Xh9woRSwNpXJehay',
    metadata: {},
    parcel: {
      description: true,
      id: 'Zt4Xh2pbbCmeVcr5YH9lsFHGqoW3i5w3',
      items: [
        {
          description: 'Shoes purchased from Shipmonk Store',
          name: 'Rubber Boots',
          currency: 'NGN',
          value: '25000',
          weight: 2.5,
          quantity: 1,
        },
      ],
      metadata: {},
      packaging: 'LsuiGzcYlz4dKRYnEXeobJu9gnVbQVXN',
      parcel_id: 'PC-25164820699',
      total_weight: 2.51,
      weight: 2.5,
      weight_unit: 'kg',
    },
    rate: '',
    shipment_id: 'SH-40208776515',
    status: 'draft',
    created_at: '2021-07-13T20:25:53.011Z',
    updated_at: '2021-07-13T20:25:53.011Z',
  }
}

export function confirmedShipment(): TerminalAfricaShipment {
  return {
    _id: '637c2db2fe4259468a4aaa1d',
    address_to: 'AD-03203451781',
    address_from: 'AD-97595221861',
    address_return: 'AD-97595221861',
    parcel: 'PC-09857312356',
    pickup_date: '2022-11-23T02:03:23.553Z',
    shipment_purpose: 'personal',
    status: 'confirmed',
    user: 'USER-00000000000',
    events: [
      {
        created_at: '2022-11-22T02:03:23.553Z',
        description: 'Shipment arranged by Ada Obi',
        location: 'Victoria Island, NG',
        status: 'confirmed',
      },
    ],
    shipment_id: 'SH-02314736509',
    created_at: '2022-11-22T02:02:26.420Z',
    updated_at: '2022-11-22T02:03:23.556Z',
    __v: 0,
    carrier: 'CA-81957188177',
    delivery_arranged: '2022-11-22T02:03:23.553Z',
    delivery_date: '2022-11-23T12:00:23.553Z',
    extras: {
      carrier_tracking_url:
        'https://www.dhl.com/global-en/home/tracking.html?tracking-id=2604444253',
      commercial_invoice_url:
        'https://sandbox.terminal.africa/v1/shipments/commercial-invoice/SH-02314736509.pdf',
      reference: 'CBJ180121002626',
      shipping_label_url: 'https://sandbox.terminal.africa/v1/shipments/label/SH-02314736509.pdf',
      tracking_number: '2604444253',
      tracking_url: 'https://sandbox.terminal.africa/v1/shipments/track/SH-02314736509',
    },
  }
}
