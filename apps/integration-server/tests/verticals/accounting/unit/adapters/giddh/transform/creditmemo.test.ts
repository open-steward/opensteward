import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/creditmemo'
import type { GiddhVoucher } from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/invoice'

function makeRaw(overrides: Partial<GiddhVoucher> = {}): GiddhVoucher {
  return {
    uniqueName: 'credit-note-001',
    number: 'CN-2024-001',
    voucherDate: '2024-03-20',
    dueDate: '2024-04-20',
    grandTotal: 11800,
    taxesTotal: 1800,
    subTotal: 10000,
    balanceDue: 11800,
    currency: 'INR',
    account: { uniqueName: 'customer-def', name: 'DEF Corp' },
    entries: [],
    status: 'pending',
    ...overrides,
  }
}

describe('transformCreditMemo (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('credit-note-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('customer-def')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(11800)
    expect(result.taxAmount).toBe(1800)
    expect(result.balanceAmount).toBe(11800)
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
    expect(result.dueAt).toEqual(new Date('2024-04-20'))
  })

  it('maps status pending to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'pending' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancel to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'cancel' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
