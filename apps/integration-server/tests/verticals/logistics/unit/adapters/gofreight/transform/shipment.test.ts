import { describe, it, expect } from 'vitest'
import {
  transformMasterBill,
  type GoFreightMasterBill,
} from '../../../../../../../src/verticals/logistics/adapters/gofreight/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeMasterBill(overrides: Partial<GoFreightMasterBill> = {}): GoFreightMasterBill {
  return {
    ref: 'REF-MB-001',
    mbl_number: 'MBL-2024-001',
    hbl_number: 'HBL-2024-001',
    status: 'in_transit',
    mode: 'ocean',
    booking_number: 'BK-2024-001',
    vessel_name: 'MV Pacific Star',
    voyage_number: 'V100W',
    shipping_line: 'COSCO',
    port_of_loading: 'CNSHA',
    port_of_discharge: 'USLAX',
    etd: '2024-03-01T00:00:00Z',
    eta: '2024-03-20T00:00:00Z',
    // Booked but not sailed — actual departure/arrival are absent until they happen.
    shipper: {
      name: 'Acme Exports Ltd',
      company: 'Acme Corp',
      address: '100 Bund, Shanghai',
      city: 'Shanghai',
      country: 'CN',
    },
    consignee: {
      name: 'Beta Imports Inc',
      company: 'Beta Corp',
      address: '200 Harbor Blvd',
      city: 'Los Angeles',
      state: 'CA',
      zip_code: '90012',
      country: 'US',
    },
    containers: [
      {
        container_number: 'COSU1234567',
        container_type: '40HC',
        seal_number: 'SL-112233',
        weight: 18000,
        weight_unit: 'kg',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('GoFreight transformMasterBill', () => {
  it('maps id from ref', () => {
    expect(transformMasterBill(makeMasterBill()).id).toBe('REF-MB-001')
  })

  it('maps trackingNumber from mbl_number', () => {
    expect(transformMasterBill(makeMasterBill()).trackingNumber).toBe('MBL-2024-001')
  })

  it('falls back to hbl_number for trackingNumber when mbl_number is missing', () => {
    const result = transformMasterBill(makeMasterBill({ mbl_number: undefined }))
    expect(result.trackingNumber).toBe('HBL-2024-001')
  })

  it('sets carrierId to gofreight', () => {
    expect(transformMasterBill(makeMasterBill()).carrierId).toBe('gofreight')
  })

  it('maps in_transit → IN_TRANSIT status', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps pending → PENDING status', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps delivered → DELIVERED status', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps cancelled → CANCELLED status', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps booking_confirmed → PENDING status', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'booking_confirmed' })).status).toBe(
      'PENDING',
    )
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformMasterBill(makeMasterBill({ status: 'unknown_status' })).status).toBe('UNKNOWN')
  })

  it('maps mode ocean → ocean', () => {
    expect(transformMasterBill(makeMasterBill({ mode: 'ocean' })).mode).toBe('ocean')
  })

  it('maps mode air → air', () => {
    expect(transformMasterBill(makeMasterBill({ mode: 'air freight' })).mode).toBe('air')
  })

  it('maps mode truck → ftl', () => {
    expect(transformMasterBill(makeMasterBill({ mode: 'truck' })).mode).toBe('ftl')
  })

  it('maps mode rail → rail', () => {
    expect(transformMasterBill(makeMasterBill({ mode: 'rail' })).mode).toBe('rail')
  })

  it('maps unknown mode → unknown', () => {
    expect(transformMasterBill(makeMasterBill({ mode: 'mystery' })).mode).toBe('unknown')
  })

  it('maps originAddress from shipper', () => {
    const result = transformMasterBill(makeMasterBill())
    expect(result.originAddress?.name).toBe('Acme Exports Ltd')
    expect(result.originAddress?.city).toBe('Shanghai')
    expect(result.originAddress?.country).toBe('CN')
  })

  it('maps destinationAddress from consignee', () => {
    const result = transformMasterBill(makeMasterBill())
    expect(result.destinationAddress?.name).toBe('Beta Imports Inc')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
    expect(result.destinationAddress?.postalCode).toBe('90012')
  })

  it('maps ocean.containerNumber from first container', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.containerNumber).toBe('COSU1234567')
  })

  it('maps ocean.containerType from first container', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.containerType).toBe('40HC')
  })

  it('maps ocean.bookingNumber', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.bookingNumber).toBe('BK-2024-001')
  })

  it('maps ocean.billOfLadingNumber from mbl_number', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.billOfLadingNumber).toBe('MBL-2024-001')
  })

  it('maps ocean.vesselName', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.vesselName).toBe('MV Pacific Star')
  })

  it('maps ocean.portOfLoading', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.portOfLoading).toBe('CNSHA')
  })

  it('maps ocean.portOfDischarge', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps ocean.estimatedDeparture from etd', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.estimatedDeparture).toBeInstanceOf(Date)
  })

  it('maps ocean.estimatedArrival from eta', () => {
    expect(transformMasterBill(makeMasterBill()).ocean?.estimatedArrival).toBeInstanceOf(Date)
  })

  it('maps totalWeight from first container weight', () => {
    const result = transformMasterBill(makeMasterBill())
    expect(result.totalWeight?.value).toBe(18000)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('omits totalWeight when containers is empty', () => {
    const result = transformMasterBill(makeMasterBill({ containers: [] }))
    expect(result.totalWeight).toBeUndefined()
  })

  it('maps reference from hbl_number', () => {
    expect(transformMasterBill(makeMasterBill()).reference).toBe('HBL-2024-001')
  })

  it('maps estimatedDeliveryAt from eta', () => {
    expect(transformMasterBill(makeMasterBill()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from created_at', () => {
    expect(transformMasterBill(makeMasterBill()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updated_at', () => {
    expect(transformMasterBill(makeMasterBill()).updatedAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeMasterBill()
    expect(transformMasterBill(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    const result = transformMasterBill(makeMasterBill())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
