import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ShippifyLabel,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<ShippifyLabel> = {}): ShippifyLabel {
  return {
    id: 'lbl-001',
    task_id: 'task-abc',
    tracking_id: 'SHIP123456',
    carrier_id: 'fedex',
    service_type: 'express',
    format: 'pdf',
    status: 'created',
    url: 'https://labels.shippify.co/lbl-001.pdf',
    base64: 'JVBERi0x',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    voided_at: null,
    ...overrides,
  }
}

describe('transformLabel (shippify)', () => {
  it('maps id, shipmentId and trackingNumber from raw fields', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('lbl-001')
    expect(result.shipmentId).toBe('task-abc')
    expect(result.trackingNumber).toBe('SHIP123456')
  })

  it('maps carrierId and serviceCode', () => {
    const result = transformLabel(makeLabel())
    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('express')
  })

  it('maps format from lowercase pdf to PDF', () => {
    expect(transformLabel(makeLabel({ format: 'pdf' })).format).toBe('PDF')
    expect(transformLabel(makeLabel({ format: 'png' })).format).toBe('PNG')
    expect(transformLabel(makeLabel({ format: 'zpl' })).format).toBe('ZPL')
    expect(transformLabel(makeLabel({ format: 'epl2' })).format).toBe('EPL2')
    expect(transformLabel(makeLabel({ format: 'unknown' })).format).toBeUndefined()
  })

  it('maps status created → CREATED and defaults unknown → CREATED', () => {
    expect(transformLabel(makeLabel({ status: 'created' })).status).toBe('CREATED')
    expect(transformLabel(makeLabel({ status: 'used' })).status).toBe('USED')
    expect(transformLabel(makeLabel({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformLabel(makeLabel({ status: 'other' })).status).toBe('CREATED')
  })

  it('maps url and base64', () => {
    const result = transformLabel(makeLabel())
    expect(result.url).toBe('https://labels.shippify.co/lbl-001.pdf')
    expect(result.base64).toBe('JVBERi0x')
  })

  it('maps createdAt and updatedAt to Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('voidedAt is undefined when voided_at is null', () => {
    expect(transformLabel(makeLabel({ voided_at: null })).voidedAt).toBeUndefined()
  })

  it('passes LabelSchema.parse without throwing', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })

  it('handles all optional fields absent', () => {
    const result = transformLabel({ id: 'min' })
    expect(result.id).toBe('min')
    expect(result.format).toBeUndefined()
    expect(result.status).toBe('CREATED')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
