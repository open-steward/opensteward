import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawCLReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawCLReturn> = {}): RawCLReturn {
  return {
    id: 'ret-001',
    number: 'RET-1042',
    status: 'approved',
    created_at: '2024-07-10T10:00:00.000Z',
    updated_at: '2024-07-12T08:00:00.000Z',
    approved_at: '2024-07-11T12:00:00.000Z',
    received_at: null,
    _type: 'returns',
    _relationships: {
      order: { data: { type: 'orders', id: 'order-001' } },
    },
    ...overrides,
  }
}

describe('transformRefund (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeReturn())
    expect(result.id).toBe('ret-001')
    expect(result.orderId).toBe('order-001')
    expect(result.reason).toBe('approved')
  })

  it('maps approved_at as processedAt', () => {
    const result = transformRefund(makeReturn())
    expect(result.processedAt).toBe('2024-07-11T12:00:00.000Z')
  })

  it('falls back to received_at when approved_at is null', () => {
    const result = transformRefund(makeReturn({
      approved_at: null,
      received_at: '2024-07-13T10:00:00.000Z',
    }))
    expect(result.processedAt).toBe('2024-07-13T10:00:00.000Z')
  })

  it('handles missing relationships', () => {
    const result = transformRefund(makeReturn({ _relationships: undefined }))
    expect(result.orderId).toBe('')
  })

  it('maps timestamps', () => {
    const result = transformRefund(makeReturn())
    expect(result.createdAt).toBe('2024-07-10T10:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturn()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeReturn())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Commerce Layer)', () => {
  it('produces JSON:API body with order relationship', () => {
    const body = untransformRefund({
      orderId: 'order-002',
    }) as { data: { type: string; relationships: Record<string, unknown> } }
    expect(body.data.type).toBe('returns')
    expect(body.data.relationships['order']).toEqual({
      data: { type: 'orders', id: 'order-002' },
    })
  })
})
