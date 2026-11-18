import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawAllegroDispute,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeDispute(overrides: Partial<RawAllegroDispute> = {}): RawAllegroDispute {
  return {
    id: 'disp-001',
    checkoutForm: { id: 'order-001' },
    subject: 'Item not as described',
    message: 'The color was different from the photo.',
    status: 'RESOLVED',
    resolvedAt: '2024-06-01T14:00:00.000Z',
    createdAt: '2024-05-28T10:00:00.000Z',
    updatedAt: '2024-06-01T14:00:00.000Z',
    buyer: { id: 'buyer-001', login: 'jan_kowalski' },
    ...overrides,
  }
}

describe('transformRefund (Allegro)', () => {
  it('maps core fields from dispute', () => {
    const result = transformRefund(makeDispute())
    expect(result.id).toBe('disp-001')
    expect(result.orderId).toBe('order-001')
    expect(result.reason).toBe('Item not as described')
    expect(result.note).toBe('The color was different from the photo.')
  })

  it('maps timestamps', () => {
    const result = transformRefund(makeDispute())
    expect(result.processedAt).toBe('2024-06-01T14:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-28T10:00:00.000Z')
  })

  it('handles missing checkout form id gracefully', () => {
    const result = transformRefund(makeDispute({ checkoutForm: undefined }))
    expect(result.orderId).toBe('unknown')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeDispute())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeDispute()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('untransformRefund (Allegro)', () => {
  it('maps canonical fields to Allegro body', () => {
    const body = untransformRefund({
      orderId: 'order-001',
      reason: 'Damaged item',
      note: 'Package arrived crushed',
    })
    expect(body['checkoutForm']).toEqual({ id: 'order-001' })
    expect(body['subject']).toBe('Damaged item')
    expect(body['message']).toBe('Package arrived crushed')
  })

  it('omits fields when not provided', () => {
    const body = untransformRefund({})
    expect(body['checkoutForm']).toBeUndefined()
    expect(body['subject']).toBeUndefined()
    expect(body['message']).toBeUndefined()
  })
})
