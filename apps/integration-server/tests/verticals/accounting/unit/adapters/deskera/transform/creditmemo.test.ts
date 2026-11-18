import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type DeskeraCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/creditmemo'

function makeRaw(overrides: Partial<DeskeraCreditMemo> = {}): DeskeraCreditMemo {
  return {
    id: 'CN-001',
    documentSequenceCode: 'CN-2024-001',
    documentDate: '2024-01-25',
    totalAmount: 2000,
    taxAmount: 180,
    balance: 2000,
    contactCode: 'CUST-001',
    contactName: 'Acme Pte Ltd',
    status: 'OPEN',
    documentItems: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('CN-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(2000)
    expect(result.taxAmount).toBe(180)
    expect(result.balanceAmount).toBe(2000)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
  })

  it('maps OPEN to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'OPEN' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps VOID to VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'VOID' }))
    expect(result.status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps document items to lineItems', () => {
    const raw = makeRaw({
      documentItems: [
        {
          id: 'li-1',
          name: 'Returned item',
          description: 'Defective widget',
          quantity: 2,
          unitPrice: 1000,
          totalAmount: 2000,
          taxAmount: 180,
          accountCode: 'SALES-001',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Defective widget')
    expect(result.lineItems![0].totalAmount).toBe(2000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
