import { describe, it, expect } from 'vitest'
import {
  transformOrderResult,
  type ClickPostOrderResult,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

describe('clickpost transformOrderResult', () => {
  function makeResult(overrides: Partial<ClickPostOrderResult> = {}): ClickPostOrderResult {
    return {
      reference_number: 'REF-001',
      waybill: 'AWB-001',
      label: 'https://example.com/label.pdf',
      security_key: 'SEC-KEY',
      sort_code: 'SORT-1',
      courier_partner_id: 42,
      courier_name: 'Delhivery',
      ...overrides,
    }
  }

  it('maps id, trackingNumber, carrierId', () => {
    const r = transformOrderResult(makeResult())
    expect(r.id).toBe('REF-001')
    expect(r.trackingNumber).toBe('AWB-001')
    expect(r.carrierId).toBe('42')
  })

  it('maps status to LABEL_CREATED when waybill present', () => {
    expect(transformOrderResult(makeResult()).status).toBe('LABEL_CREATED')
  })

  it('maps status to PENDING when waybill is null', () => {
    expect(transformOrderResult(makeResult({ waybill: null })).status).toBe('PENDING')
  })

  it('maps labelUrl', () => {
    const r = transformOrderResult(makeResult())
    expect(r.labelUrl).toBe('https://example.com/label.pdf')
  })

  it('sets mode to parcel', () => {
    expect(transformOrderResult(makeResult()).mode).toBe('parcel')
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformOrderResult(makeResult()))).not.toThrow()
  })
})
