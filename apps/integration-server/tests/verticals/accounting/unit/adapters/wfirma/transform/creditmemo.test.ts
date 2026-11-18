import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/creditmemo'
import type { WfirmaInvoice } from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCorrection(overrides: Partial<WfirmaInvoice> = {}): WfirmaInvoice {
  return {
    id: 600,
    fullnumber: 'FK 1/2024',
    number: 1,
    date: '2024-06-15',
    paymentdate: '2024-07-15',
    paymentstate: 'unpaid',
    type: 'correction',
    netto: '200.00',
    brutto: '246.00',
    tax: '46.00',
    paid: '0.00',
    remaining: '246.00',
    currency: 'PLN',
    notes: 'Correction reason: defective goods',
    contractor_id: 77,
    created: '2024-06-14T00:00:00.000Z',
    modified: '2024-06-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(result.id).toBe('600')
    expect(result.creditmemoNumber).toBe('FK 1/2024')
    expect(result.contactId).toBe('77')
    expect(result.currency).toBe('PLN')
    expect(result.notes).toBe('Correction reason: defective goods')
  })

  it('converts brutto to totalAmount in minor units', () => {
    const result = transformCreditMemo(makeCorrection({ brutto: '246.00' }))
    expect(result.totalAmount).toBe(24600)
  })

  it('converts tax to taxAmount in minor units', () => {
    const result = transformCreditMemo(makeCorrection({ tax: '46.00' }))
    expect(result.taxAmount).toBe(4600)
  })

  it('maps paymentstate unpaid to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCorrection({ paymentstate: 'unpaid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paymentstate paid to PAID', () => {
    const result = transformCreditMemo(makeCorrection({ paymentstate: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('defaults to DRAFT for other paymentstate', () => {
    const result = transformCreditMemo(makeCorrection({ paymentstate: 'undefined' }))
    expect(result.status).toBe('DRAFT')
  })

  it('falls back to number when fullnumber absent', () => {
    const result = transformCreditMemo(makeCorrection({ fullnumber: undefined, number: 5 }))
    expect(result.creditmemoNumber).toBe('5')
  })

  it('falls back to description for notes when notes absent', () => {
    const result = transformCreditMemo(
      makeCorrection({ notes: undefined, description: 'Desc fallback' }),
    )
    expect(result.notes).toBe('Desc fallback')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makeCorrection()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformCreditMemo(makeCorrection())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
