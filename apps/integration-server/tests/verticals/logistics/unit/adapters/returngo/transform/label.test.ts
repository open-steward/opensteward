import { describe, it, expect } from 'vitest'
import { transformRmaToLabel } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/label'
import type { ReturnGoRma } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/rma'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<ReturnGoRma> = {}): ReturnGoRma {
  return {
    id: 'rma-001',
    carrier: 'USPS',
    tracking_number: 'TRK-RG-001',
    label_url: 'https://labels.returngo.example/rma-001.pdf',
    return_status: 'pending',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    currency: 'USD',
    shipment: {
      tracking_number: 'TRK-RG-001',
      carrier: 'USPS',
      service: 'USPS_PRIORITY',
      label_url: 'https://labels.returngo.example/rma-001.pdf',
      label_cost: 8.5,
      status: 'pending',
    },
    ...overrides,
  }
}

// ─── transformRmaToLabel ──────────────────────────────────────────────────────

describe('ReturnGO transformRmaToLabel', () => {
  it('returns undefined when no label_url is present', () => {
    const result = transformRmaToLabel({ id: 'rma-x' })
    expect(result).toBeUndefined()
  })

  it('maps id as string from rma id', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.id).toBe('rma-001')
    expect(result?.shipmentId).toBe('rma-001')
  })

  it('maps tracking number and carrier', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.trackingNumber).toBe('TRK-RG-001')
    expect(result?.carrierId).toBe('USPS')
  })

  it('maps service code', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.serviceCode).toBe('USPS_PRIORITY')
  })

  it('maps label url', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.url).toBe('https://labels.returngo.example/rma-001.pdf')
  })

  it('maps cost when label_cost and currency present', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.cost?.amount).toBe(850)
    expect(result?.cost?.currency).toBe('USD')
  })

  it('omits cost when currency is absent', () => {
    const result = transformRmaToLabel(makeRaw({ currency: null }))
    expect(result?.cost).toBeUndefined()
  })

  it('maps pending status to CREATED', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.status).toBe('CREATED')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformRmaToLabel(
      makeRaw({ return_status: 'cancelled', shipment: { status: 'cancelled' } }),
    )
    expect(result?.status).toBe('VOIDED')
  })

  it('maps received/complete status to USED', () => {
    const result = transformRmaToLabel(
      makeRaw({
        shipment: { status: 'received', label_url: 'https://labels.returngo.example/rma-001.pdf' },
      }),
    )
    expect(result?.status).toBe('USED')
  })

  it('format is always undefined (ReturnGO does not surface label format)', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.format).toBeUndefined()
  })

  it('parses date fields to Date instances', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(result?.createdAt).toBeInstanceOf(Date)
    expect(result?.updatedAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse when cost is present', () => {
    const result = transformRmaToLabel(makeRaw())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('passes LabelSchema.parse when cost is absent', () => {
    const result = transformRmaToLabel(makeRaw({ currency: null }))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
