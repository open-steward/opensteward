import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type ScopevisioCredit,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRaw(overrides: Partial<ScopevisioCredit> = {}): ScopevisioCredit {
  return {
    id: 10,
    documentNumber: 'GS-2024-0001',
    status: 'POSTED',
    customerContactId: 5,
    currency: 'EUR',
    totalGross: -5000,
    totalNet: -4200,
    totalVat: -800,
    openAmount: 5000,
    isPaid: false,
    documentDate: EPOCH_MS,
    dueDate: EPOCH_MS + 14 * 86400000,
    documentText: 'Credit for over-billing',
    positions: [
      {
        id: 1,
        name: 'Widget refund',
        quantity: 2,
        unitPrice: 2100,
        totalGross: -4200,
        totalVat: -800,
        accountNumber: '4000',
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo (scopevisio)', () => {
  it('maps documentNumber to id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('GS-2024-0001')
  })

  it('maps documentNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeRaw()).creditmemoNumber).toBe('GS-2024-0001')
  })

  it('maps customerContactId to contactId string', () => {
    expect(transformCreditMemo(makeRaw()).contactId).toBe('5')
  })

  it('maps totalGross absolute value to totalAmount', () => {
    // source: Math.abs(raw.totalGross) — 5000
    expect(transformCreditMemo(makeRaw()).totalAmount).toBe(5000)
  })

  it('maps totalVat absolute value to taxAmount', () => {
    expect(transformCreditMemo(makeRaw()).taxAmount).toBe(800)
  })

  it('maps documentDate epoch ms to Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps documentText to notes', () => {
    expect(transformCreditMemo(makeRaw()).notes).toBe('Credit for over-billing')
  })

  it('maps position fields to lineItems', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Widget refund')
    expect(result.lineItems![0].accountId).toBe('4000')
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('maps POSTED + openAmount>0 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeRaw()))).not.toThrow()
  })
})
