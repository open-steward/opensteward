import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  transformRefunds,
  type RawBolReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/bol/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawBolReturn> = {}): RawBolReturn {
  return {
    returnId: '86127131',
    registrationDateTime: '2024-11-25T14:00:00+01:00',
    fulfilmentMethod: 'FBR',
    returnItems: [
      {
        rmaId: 'RMA-001',
        orderId: '1043946570',
        orderItemId: 'BFC0000000000001',
        ean: '8712345678901',
        title: 'Premium Dutch Widget',
        expectedQuantity: 1,
        returnReason: {
          mainReason: 'PRODUCT_DEFECTIVE',
          detailedReason: 'Item arrived broken',
          customerComments: 'The widget was cracked on arrival.',
        },
        trackAndTrace: '3STGNL9876543210',
        transporterName: 'PostNL',
        handled: false,
        processingResults: [
          {
            quantity: 1,
            processingResult: 'ACCEPTED',
            handlingResult: 'RETURN_RECEIVED',
            processingDateTime: '2024-11-26T10:00:00+01:00',
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('transformRefund (Bol.com)', () => {
  it('maps returnId to the canonical id and orderId from first item', () => {
    const r = transformRefund(makeReturn())
    expect(r.id).toBe('86127131')
    expect(r.orderId).toBe('1043946570')
  })

  it('maps reason and customer note', () => {
    const r = transformRefund(makeReturn())
    expect(r.reason).toBe('PRODUCT_DEFECTIVE')
    expect(r.note).toBe('The widget was cracked on arrival.')
  })

  it('uses processingDateTime for processedAt when available', () => {
    const r = transformRefund(makeReturn())
    expect(r.processedAt).toBe('2024-11-26T10:00:00+01:00')
  })

  it('falls back to registrationDateTime when no processing results', () => {
    const r = transformRefund(
      makeReturn({
        returnItems: [
          {
            orderId: 'ORD-1',
            orderItemId: 'OI-1',
            expectedQuantity: 1,
            returnReason: { mainReason: 'WRONG_ITEM' },
          },
        ],
      }),
    )
    expect(r.processedAt).toBe('2024-11-25T14:00:00+01:00')
  })

  it('handles return with no returnItems gracefully', () => {
    const r = transformRefund(
      makeReturn({ returnItems: undefined }),
    )
    expect(r.orderId).toBe('unknown')
    expect(r.reason).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturn()
    const r = transformRefund(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const r = transformRefund(makeReturn())
    expect(() => RefundSchema.parse(r)).not.toThrow()
  })

  it('transformRefunds maps a list', () => {
    const list = transformRefunds([
      makeReturn({ returnId: 'R-1' }),
      makeReturn({ returnId: 'R-2' }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('R-1')
    expect(list[1]!.id).toBe('R-2')
  })

  it('transformRefunds returns empty for undefined/empty', () => {
    expect(transformRefunds(undefined)).toEqual([])
    expect(transformRefunds([])).toEqual([])
  })
})
