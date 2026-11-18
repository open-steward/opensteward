import { describe, it, expect } from 'vitest'
import {
  transformHouseBill,
  type GoFreightHouseBill,
} from '../../../../../../../src/verticals/logistics/adapters/gofreight/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeHouseBill(overrides: Partial<GoFreightHouseBill> = {}): GoFreightHouseBill {
  return {
    ref: 'REF-HB-001',
    hbl_number: 'HBL-2024-001',
    mbl_ref: 'MBL-2024-001',
    status: 'in_transit',
    shipper_ref: 'SHPR-001',
    consignee_ref: 'CONS-001',
    description_of_goods: 'Electronic components',
    total_pieces: 10,
    total_weight: 500,
    total_weight_unit: 'kg',
    total_cbm: 2.5,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('GoFreight transformHouseBill', () => {
  it('maps id from ref', () => {
    expect(transformHouseBill(makeHouseBill()).id).toBe('REF-HB-001')
  })

  it('maps orderNumber from hbl_number', () => {
    expect(transformHouseBill(makeHouseBill()).orderNumber).toBe('HBL-2024-001')
  })

  it('falls back to ref for orderNumber when hbl_number is missing', () => {
    expect(transformHouseBill(makeHouseBill({ hbl_number: undefined })).orderNumber).toBe(
      'REF-HB-001',
    )
  })

  it('maps in_transit → SHIPPED status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'in_transit' })).status).toBe('SHIPPED')
  })

  it('maps pending → PENDING status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps processing → PROCESSING status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'processing' })).status).toBe('PROCESSING')
  })

  it('maps on_hold → ON_HOLD status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'on_hold' })).status).toBe('ON_HOLD')
  })

  it('maps awaiting_shipment → AWAITING_SHIPMENT status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'awaiting_shipment' })).status).toBe(
      'AWAITING_SHIPMENT',
    )
  })

  it('maps delivered → DELIVERED status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps cancelled → CANCELLED status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps returned → RETURNED status', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformHouseBill(makeHouseBill({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps undefined status → UNKNOWN', () => {
    expect(transformHouseBill(makeHouseBill({ status: undefined })).status).toBe('UNKNOWN')
  })

  it('maps shipmentIds from mbl_ref', () => {
    expect(transformHouseBill(makeHouseBill()).shipmentIds).toEqual(['MBL-2024-001'])
  })

  it('omits shipmentIds when mbl_ref is missing', () => {
    expect(transformHouseBill(makeHouseBill({ mbl_ref: undefined })).shipmentIds).toBeUndefined()
  })

  it('maps notes from description_of_goods', () => {
    expect(transformHouseBill(makeHouseBill()).notes).toBe('Electronic components')
  })

  it('maps createdAt from created_at', () => {
    expect(transformHouseBill(makeHouseBill()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updated_at', () => {
    expect(transformHouseBill(makeHouseBill()).updatedAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeHouseBill()
    expect(transformHouseBill(raw).metadata).toBe(raw)
  })

  it('produces output that parses against OrderSchema', () => {
    const result = transformHouseBill(makeHouseBill())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
