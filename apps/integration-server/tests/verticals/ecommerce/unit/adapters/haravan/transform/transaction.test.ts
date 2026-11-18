/**
 * Haravan Transaction transform — verified against
 * https://docs.haravan.com/docs/omni-apis/transactions/ raw doc HTML: no
 * `parent_id`/`error_code`/`message`/`processed_at` fields (unlike Shopify),
 * `currency` is a real per-transaction field.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawHaravanTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawHaravanTransaction> = {}): RawHaravanTransaction {
  return {
    id: 1095862541,
    order_id: 1235924702,
    kind: 'Capture',
    status: 'success',
    amount: 180000,
    currency: 'VND',
    gateway: 'Thanh toán khi giao hàng (COD)',
    authorization: null,
    created_at: '2021-05-13T07:29:20.1Z',
    ...overrides,
  }
}

describe('transformTransaction (haravan)', () => {
  it('maps id, orderId, kind, and status', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('1095862541')
    expect(result.orderId).toBe('1235924702')
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('uses the transaction’s own currency field', () => {
    expect(transformTransaction(makeRaw()).amount).toEqual({ amount: 180000, currency: 'VND' })
  })

  it('leaves undocumented fields undefined rather than guessing', () => {
    const result = transformTransaction(makeRaw())
    expect(result.parentTransactionId).toBeUndefined()
    expect(result.errorCode).toBeUndefined()
    expect(result.processedAt).toBeUndefined()
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformTransaction', () => {
    const body = untransformTransaction(transformTransaction(makeRaw()))
    expect(body['gateway']).toBe('Thanh toán khi giao hàng (COD)')
  })
})
