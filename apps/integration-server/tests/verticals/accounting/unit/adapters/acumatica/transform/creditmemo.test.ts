import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AcumaticaCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AcumaticaCreditMemo> = {}): AcumaticaCreditMemo {
  return {
    RefNbr: 'CM001',
    Type: 'CreditMemo',
    Status: 'Open',
    Amount: 500,
    TaxTotal: 50,
    CurrencyID: 'USD',
    CustomerID: 'CUST001',
    DocDate: '2024-03-15',
    Details: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Acumatica)', () => {
  it('maps id from RefNbr', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('CM001')
  })

  it('maps contacts from CustomerID', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('CUST001')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(50)
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('parses DocDate as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('maps Open status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Hold status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
