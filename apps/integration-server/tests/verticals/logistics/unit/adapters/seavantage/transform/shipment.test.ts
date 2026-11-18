import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  mapShipmentStatus,
  type SeaVantageCargoResponse,
} from '../../../../../../../src/verticals/logistics/adapters/seavantage/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeCargo(overrides: Partial<SeaVantageCargoResponse> = {}): SeaVantageCargoResponse {
  return {
    shipment_id: 'SV-001',
    type: 'FCL',
    carrier: 'MAEU',
    vessel: 'MV Ocean Star',
    voyage_number: 'V123E',
    container_number: 'MSCU1234567',
    container_type: '40HC',
    booking_number: 'BK-2024-001',
    mbl_number: 'BL-2024-001',
    loading_port: 'CNSHA',
    discharging_port: 'USLAX',
    etd: '2024-03-01T00:00:00Z',
    atd: '2024-03-02T06:00:00Z',
    eta_carrier: '2024-03-20T00:00:00Z',
    pta_seavantage: '2024-03-19T12:00:00Z',
    ata: null,
    status: 'ON_VESSEL',
    milestones: [
      {
        event: 'GATE_IN',
        actual_time: '2024-03-01T00:00:00Z',
        estimated_time: null,
        location: 'Shanghai',
        description: 'Container gate-in at origin port',
      },
    ],
    ...overrides,
  }
}

describe('seavantage mapShipmentStatus', () => {
  it('maps ON_VESSEL → IN_TRANSIT', () => {
    expect(mapShipmentStatus('ON_VESSEL')).toBe('IN_TRANSIT')
  })

  it('maps DEPARTED → IN_TRANSIT', () => {
    expect(mapShipmentStatus('DEPARTED')).toBe('IN_TRANSIT')
  })

  it('maps IN_TRANSIT → IN_TRANSIT', () => {
    expect(mapShipmentStatus('IN_TRANSIT')).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED → DELIVERED', () => {
    expect(mapShipmentStatus('DELIVERED')).toBe('DELIVERED')
  })

  it('maps DISCHARGED → DELIVERED', () => {
    expect(mapShipmentStatus('DISCHARGED')).toBe('DELIVERED')
  })

  it('maps GATE_OUT → OUT_FOR_DELIVERY', () => {
    expect(mapShipmentStatus('GATE_OUT')).toBe('OUT_FOR_DELIVERY')
  })

  it('maps BOOKED → LABEL_CREATED', () => {
    expect(mapShipmentStatus('BOOKED')).toBe('LABEL_CREATED')
  })

  it('maps GATE_IN → LABEL_CREATED', () => {
    expect(mapShipmentStatus('GATE_IN')).toBe('LABEL_CREATED')
  })

  it('maps EXCEPTION → EXCEPTION', () => {
    expect(mapShipmentStatus('EXCEPTION')).toBe('EXCEPTION')
  })

  it('maps CANCEL → CANCELLED', () => {
    expect(mapShipmentStatus('CANCEL')).toBe('CANCELLED')
  })

  it('maps RETURNED → RETURNED', () => {
    expect(mapShipmentStatus('RETURNED')).toBe('RETURNED')
  })

  it('maps PENDING → PENDING', () => {
    expect(mapShipmentStatus('PENDING')).toBe('PENDING')
  })

  it('maps unknown → UNKNOWN', () => {
    expect(mapShipmentStatus('NOPE')).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for null', () => {
    expect(mapShipmentStatus(null)).toBe('UNKNOWN')
  })
})

describe('seavantage transformShipment', () => {
  it('maps id from shipment_id', () => {
    expect(transformShipment(makeCargo()).id).toBe('SV-001')
  })

  it('maps status from status field', () => {
    expect(transformShipment(makeCargo()).status).toBe('IN_TRANSIT')
  })

  it('prefers container_number as trackingNumber', () => {
    expect(transformShipment(makeCargo()).trackingNumber).toBe('MSCU1234567')
  })

  it('falls back to mbl_number when no container_number', () => {
    const r = transformShipment(makeCargo({ container_number: null }))
    expect(r.trackingNumber).toBe('BL-2024-001')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformShipment(makeCargo()).carrierId).toBe('MAEU')
  })

  it('sets mode to ocean', () => {
    expect(transformShipment(makeCargo()).mode).toBe('ocean')
  })

  it('maps booking_number as reference', () => {
    expect(transformShipment(makeCargo()).reference).toBe('BK-2024-001')
  })

  it('prefers pta_seavantage for estimatedDeliveryAt', () => {
    const r = transformShipment(makeCargo())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
    // pta_seavantage is 2024-03-19, eta_carrier is 2024-03-20; pta takes priority
    expect(r.estimatedDeliveryAt!.toISOString().startsWith('2024-03-19')).toBe(true)
  })

  it('maps actualDeliveryAt from ata when present', () => {
    const r = transformShipment(makeCargo({ ata: '2024-03-21T00:00:00Z' }))
    expect(r.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('leaves actualDeliveryAt undefined when ata is null', () => {
    expect(transformShipment(makeCargo()).actualDeliveryAt).toBeUndefined()
  })

  it('maps ocean.containerNumber', () => {
    expect(transformShipment(makeCargo()).ocean?.containerNumber).toBe('MSCU1234567')
  })

  it('maps ocean.containerType', () => {
    expect(transformShipment(makeCargo()).ocean?.containerType).toBe('40HC')
  })

  it('maps ocean.vesselName', () => {
    expect(transformShipment(makeCargo()).ocean?.vesselName).toBe('MV Ocean Star')
  })

  it('maps ocean.portOfLoading', () => {
    expect(transformShipment(makeCargo()).ocean?.portOfLoading).toBe('CNSHA')
  })

  it('maps ocean.portOfDischarge', () => {
    expect(transformShipment(makeCargo()).ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps ocean.estimatedDeparture from etd', () => {
    expect(transformShipment(makeCargo()).ocean?.estimatedDeparture).toBeInstanceOf(Date)
  })

  it('maps ocean.actualDeparture from atd', () => {
    expect(transformShipment(makeCargo()).ocean?.actualDeparture).toBeInstanceOf(Date)
  })

  it('maps ocean.shippingLine from carrier', () => {
    expect(transformShipment(makeCargo()).ocean?.shippingLine).toBe('MAEU')
  })

  it('preserves raw metadata', () => {
    const raw = makeCargo()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeCargo())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
