import { describe, it, expect } from 'vitest'
import {
  transformLabelRequestToLabel,
  type LoopLabelRequest,
} from '../../../../../../../src/verticals/logistics/adapters/loop-returns/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<LoopLabelRequest> = {}): LoopLabelRequest {
  return {
    id: 101,
    return_id: 202,
    status: 'issued',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('loop-returns transformLabelRequestToLabel', () => {
  it('converts numeric id to string', () => {
    expect(transformLabelRequestToLabel(makeRaw({ id: 101 })).id).toBe('101')
  })

  it('converts string id to string', () => {
    expect(transformLabelRequestToLabel(makeRaw({ id: 'lr-001' })).id).toBe('lr-001')
  })

  it('id is undefined when id is null', () => {
    expect(transformLabelRequestToLabel(makeRaw({ id: null })).id).toBeUndefined()
  })

  it('maps shipmentId from return_id', () => {
    expect(transformLabelRequestToLabel(makeRaw({ return_id: 202 })).shipmentId).toBe('202')
  })

  it('maps status issued → CREATED', () => {
    expect(transformLabelRequestToLabel(makeRaw({ status: 'issued' })).status).toBe('CREATED')
  })

  it('maps status fulfilled → USED', () => {
    expect(transformLabelRequestToLabel(makeRaw({ status: 'fulfilled' })).status).toBe('USED')
  })

  it('maps status cancelled → VOIDED', () => {
    expect(transformLabelRequestToLabel(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformLabelRequestToLabel(makeRaw({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('parses createdAt as Date', () => {
    expect(transformLabelRequestToLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformLabelRequestToLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabelRequestToLabel(makeRaw())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
