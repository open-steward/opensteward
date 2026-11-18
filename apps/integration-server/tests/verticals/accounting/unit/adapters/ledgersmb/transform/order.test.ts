import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type LedgerSMBOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrder(overrides: Partial<LedgerSMBOrder> = {}): LedgerSMBOrder {
  return {
    id: 'ord-5',
    type: 'customer',
    currency: 'USD',
    eca: { id: 10, type: 'customer' },
    total: 500.0,
    dates: { order: '2024-09-01' },
    workflow: { state: 'SAVED' },
    lines: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields with minor-unit conversion', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-5')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('USD')
    // 500.0 → 50000
    expect(result.totalAmount).toBe(50000)
  })

  it('maps type customer to SALES', () => {
    expect(transformOrder(makeOrder({ type: 'customer' })).type).toBe('SALES')
  })

  it('maps type vendor to PURCHASE', () => {
    expect(transformOrder(makeOrder({ type: 'vendor' })).type).toBe('PURCHASE')
  })

  it('maps workflow SAVED to ACTIVE', () => {
    expect(transformOrder(makeOrder({ workflow: { state: 'SAVED' } })).status).toBe('ACTIVE')
  })

  it('maps workflow POSTED to COMPLETED', () => {
    expect(transformOrder(makeOrder({ workflow: { state: 'POSTED' } })).status).toBe('COMPLETED')
  })

  it('maps workflow INITIAL to DRAFT', () => {
    expect(transformOrder(makeOrder({ workflow: { state: 'INITIAL' } })).status).toBe('DRAFT')
  })

  it('maps workflow VOIDED to CANCELLED', () => {
    expect(transformOrder(makeOrder({ workflow: { state: 'VOIDED' } })).status).toBe('CANCELLED')
  })

  it('parses dates.order as postedAt', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('passes schema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('round-trips through untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const wire = untransformOrder(canonical)
    expect((wire.eca as { id?: string })?.id).toBe('10')
    expect(wire.currency).toBe('USD')
  })
})
