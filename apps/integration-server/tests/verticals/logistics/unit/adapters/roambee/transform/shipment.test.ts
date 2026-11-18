/**
 * GET /v2/shipment ("Get List of Shipments") and GET /v2/shipment/summary
 * ("Get Shipment Details"), https://docs.decklar.com/. Fixtures are the
 * documented 200 examples (the summary's nested objects trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformShipmentRow,
  transformShipmentSummary,
  type RoambeeShipmentRow,
  type RoambeeShipmentSummary,
} from '../../../../../../../src/verticals/logistics/adapters/roambee/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

const DOCUMENTED_ROW: RoambeeShipmentRow = {
  shipment_id: 265763,
  uuid: 'd173c518-7a3b-461c-92dd-e583cd7b0bab',
  data: '{"name":"Shipment Name","custom_fields":[{"label":"AWB","value":"615-32102700"}]}',
  account_id: 1,
  active: 1,
  created_date: '20210908',
  updated_date: 1631112243,
  bee_name: 'ORDERED-TEST-BEE-20210424080649-999921042408073494',
  battery_days: 24,
  temp: 30,
  last_known_location: '3B, Adwait Society, Ranip, Ahmedabad, Gujarat 382480, India',
  last_known_geo: { lat: '23.075598425010575', lon: '72.58038804556043' },
  last_known_time: 1619231809000,
  account_name: 'Roambee',
  desti_location_name: 'pune ',
  orgi_location_name: 'Ambala',
  created_date_timestamp: 1631112242000,
  in_transits: 0,
  shipment_status: 'not started',
  actual_arrival: 0,
  actual_departure: 0,
  scheduled_arrival: 1632149972000,
  scheduled_departure: 1632149132000,
  shipment_name: 'Shipment Name',
  shipment_type: 'Regular',
  custom_fields: { awb: '615-32102700' },
}

const DOCUMENTED_SUMMARY: RoambeeShipmentSummary = {
  isSingleBeeShipment: true,
  name: 'W 11/02-16/02 611576 WCZ>LLA ATC/**  (Baltic Sea)',
  active: 0,
  parent_shipment: null,
  description: '18 racks',
  scheduled_arrival: 1613498400,
  scheduled_departure: 1613030400,
  actual_arrival: 1613453589,
  actual_departure: 1613062539,
  public_tracking_url: 'https://staging.decklar.com/track/aX4jBk2',
  origin: {
    name: 'Wistron InfoComm (Czech) s.r.o',
    address: 'Vlastimila Pecha 10, 627 00 Brno-Černovice, Czechia',
    uuid: '1cc895a4-159f-4549-a9d5-a7b127db2831',
  },
  destination: {
    name: 'Facebook LLA',
    address: 'Datavägen 7, 977 54 Luleå, Sweden',
    uuid: '97d2ed60-cb5a-4e44-8822-9ca51ab4c867',
  },
  created_date: 1612868387,
  account_id: 920,
}

describe('Roambee transformShipmentRow', () => {
  it('parses the documented list row with ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformShipmentRow(DOCUMENTED_ROW))
    expect(s.id).toBe('d173c518-7a3b-461c-92dd-e583cd7b0bab')
    expect(s.status).toBe('PENDING')
    expect(s.createdAt?.getTime()).toBe(1631112242000)
    expect(s.updatedAt?.getTime()).toBe(1631112243 * 1000)
    expect(s.estimatedDeliveryAt?.getTime()).toBe(1632149972000)
    expect(s.metadata).toEqual(DOCUMENTED_ROW)
  })

  it('never invents a tracking number, addresses or a delivery time', () => {
    const s = transformShipmentRow(DOCUMENTED_ROW)
    expect(s.trackingNumber).toBeUndefined()
    expect(s.originAddress).toBeUndefined()
    expect(s.actualDeliveryAt).toBeUndefined()
  })

  it('matches the documented shipment_status exactly: another casing is UNKNOWN', () => {
    expect(transformShipmentRow({ ...DOCUMENTED_ROW, shipment_status: 'Not Started' }).status).toBe(
      'UNKNOWN',
    )
  })

  it('maps an undocumented shipment_status to UNKNOWN', () => {
    expect(transformShipmentRow({ ...DOCUMENTED_ROW, shipment_status: 'whatever' }).status).toBe(
      'UNKNOWN',
    )
  })

  it('throws on a row with no uuid', () => {
    expect(() => transformShipmentRow({ ...DOCUMENTED_ROW, uuid: undefined })).toThrow(/uuid/)
  })
})

describe('Roambee transformShipmentSummary', () => {
  const UUID = 'd173c518-7a3b-461c-92dd-e583cd7b0bab'

  it('parses the documented summary with ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformShipmentSummary(UUID, DOCUMENTED_SUMMARY))
    expect(s.id).toBe(UUID)
    expect(s.originAddress).toEqual({
      street1: 'Vlastimila Pecha 10, 627 00 Brno-Černovice, Czechia',
    })
    expect(s.destinationAddress).toEqual({ street1: 'Datavägen 7, 977 54 Luleå, Sweden' })
    expect(s.estimatedDeliveryAt?.getTime()).toBe(1613498400 * 1000)
    expect(s.actualDeliveryAt?.getTime()).toBe(1613453589 * 1000)
    expect(s.createdAt?.getTime()).toBe(1612868387 * 1000)
    expect(s.notes).toBe('18 racks')
    expect(s.status).toBeUndefined()
  })

  it('leaves actualDeliveryAt unset while actual_arrival is 0', () => {
    const s = transformShipmentSummary(UUID, { ...DOCUMENTED_SUMMARY, actual_arrival: 0 })
    expect(s.actualDeliveryAt).toBeUndefined()
    ShipmentSchema.parse(s)
  })
})
