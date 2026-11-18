/**
 * transformHistoryShipment maps one GET /shipments-history row. The fixture
 * is the documented example row from the RAML,
 * https://api.unifaun.com/rs-extapi/v1/documentation/root-resource-v1.raml
 */
import { describe, it, expect } from 'vitest'
import {
  transformHistoryShipment,
  type NShiftHistoryShipment,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/shipment-history'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function documentedRow(overrides: Partial<NShiftHistoryShipment> = {}): NShiftHistoryShipment {
  return {
    href: 'https://api.unifaun.com/ufoweb-prod-202609221132/rs-extapi/v1/shipments/5666306',
    id: '5666306',
    status: 'PRINTED',
    shipmentNo: null,
    orderNo: 'order number 123',
    route: null,
    routingCode: null,
    reference: 'sender ref 234',
    serviceId: 'P15',
    parcelCount: 1,
    sndName: 'nShift Gbg',
    sndZipcode: '41121',
    sndCity: 'GÖTEBORG',
    sndCountry: 'SE',
    sndQuickId: '1',
    rcvName: 'nShift Sthm',
    rcvZipcode: '11359',
    rcvCity: 'STOCKHOLM',
    rcvCountry: 'SE',
    rcvQuickId: '',
    created: '2015-06-03T13:18:30.904+0000',
    changed: '2015-06-03T13:18:30.904+0000',
    shipDate: '2015-06-03T13:18:30.000+0000',
    printed: '2015-06-03T13:18:30.000+0000',
    returnShipment: false,
    normalShipment: false,
    consolidated: false,
    deliveryCode: '342345',
    profileGroup: 'Perusprofiiliryhmä',
    newWaybillId: '123456789',
    parcels: [
      { parcelNo: '373325389893906035', returnParcelNo: null, reference: '', partOrderNo: '' },
    ],
    pdfs: null,
    previousPdfs: null,
    prints: null,
    previousPrints: null,
    addons: '[NOTSMS]',
    statuses: null,
    ...overrides,
  }
}

describe('transformHistoryShipment', () => {
  it('maps the documented example row and parses against ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformHistoryShipment(documentedRow()))
    expect(s.id).toBe('5666306')
    expect(s.status).toBe('LABEL_CREATED')
    expect(s.trackingNumber).toBe('373325389893906035')
    expect(s.serviceCode).toBe('P15')
    expect(s.reference).toBe('sender ref 234')
    // No partner field in the documented row, so no Carrier.id to point at.
    expect(s.carrierId).toBeUndefined()
    expect(s.originAddress).toEqual({
      name: 'nShift Gbg',
      postalCode: '41121',
      city: 'GÖTEBORG',
      country: 'SE',
    })
    expect(s.destinationAddress).toEqual({
      name: 'nShift Sthm',
      postalCode: '11359',
      city: 'STOCKHOLM',
      country: 'SE',
    })
    expect(s.createdAt?.toISOString()).toBe('2015-06-03T13:18:30.904Z')
    expect(s.updatedAt?.toISOString()).toBe('2015-06-03T13:18:30.904Z')
    expect(s.labelUrl).toBeUndefined()
    expect(s.cost).toBeUndefined()
  })

  it.each([
    ['printed', 'LABEL_CREATED'],
    ['DISPATCHING', 'IN_TRANSIT'],
    ['delivering', 'IN_TRANSIT'],
    ['partdelivered', 'IN_TRANSIT'],
    ['OUTFORDELIVERY', 'OUT_FOR_DELIVERY'],
    ['delivered', 'DELIVERED'],
    ['returned', 'RETURNED'],
    ['cancelled', 'CANCELLED'],
    ['SOMETHING_ELSE', 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ] as const)('maps documented status %s to %s', (status, expected) => {
    const s = ShipmentSchema.parse(transformHistoryShipment(documentedRow({ status })))
    expect(s.status).toBe(expected)
  })

  it('omits a country that is not ISO 3166 alpha-2 rather than guessing', () => {
    const s = ShipmentSchema.parse(
      transformHistoryShipment(documentedRow({ sndCountry: 'Sweden', rcvCountry: null })),
    )
    expect(s.originAddress?.country).toBeUndefined()
    expect(s.destinationAddress?.country).toBeUndefined()
  })

  it('leaves addresses and tracking number unset when the row has none', () => {
    const s = ShipmentSchema.parse(
      transformHistoryShipment({
        href: 'https://api.unifaun.com/rs-extapi/v1/shipments/1',
        id: '1',
        parcels: [],
      }),
    )
    expect(s.originAddress).toBeUndefined()
    expect(s.destinationAddress).toBeUndefined()
    expect(s.trackingNumber).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })
})
