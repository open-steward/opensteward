import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RefundContext,
} from '../../../../../../../src/verticals/payments/adapters/cellpoint-digital/transform/refund'
import type { XmlNode } from '../../../../../../../src/verticals/payments/adapters/cellpoint-digital/transform/shared'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const baseCtx: RefundContext = {
  chargeId: 'TX-001',
  amount: 4999,
  currency: 'USD',
  orderNo: 'ORD-42',
}

describe('cellpoint-digital transformRefund', () => {
  it('maps code 1000 (operationSuccess) to status "succeeded"', () => {
    const raw: XmlNode = { code: { $text: '1000' } }
    const result = transformRefund(raw, baseCtx)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cellpoint-digital')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('threads chargeId, amount, and currency from the context', () => {
    const raw: XmlNode = { code: { $text: '1000' } }
    const result = transformRefund(raw, baseCtx)
    expect(result.chargeId).toBe('TX-001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-1000 code to status "failed"', () => {
    const raw: XmlNode = { code: { $text: '500' } }
    const result = transformRefund(raw, { ...baseCtx, chargeId: 'TX-002' })
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a missing code to status "pending"', () => {
    const raw: XmlNode = {}
    const result = transformRefund(raw, baseCtx)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('accepts a raw XML string and parses the code element', () => {
    const xml = `<?xml version="1.0"?><reversal><code>1000</code></reversal>`
    const result = transformRefund(xml, baseCtx)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
