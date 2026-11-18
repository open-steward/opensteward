import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type EcountCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/creditmemo'

function makeRaw(overrides: Partial<EcountCreditNote> = {}): EcountCreditNote {
  return {
    SLIP_NO: 'CN-2024-001',
    IO_DATE: '2024-01-25',
    CUST_CODE: 'CUST-001',
    CUST_NAME: 'Acme Korea Ltd',
    TOTAL_AMT: 55000,
    VAT_AMT: 5000,
    STATUS: '02',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('CN-2024-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(55000)
    expect(result.taxAmount).toBe(5000)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
  })

  it('maps STATUS 01 to DRAFT', () => {
    const result = transformCreditMemo(makeRaw({ STATUS: '01' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps STATUS 02 to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ STATUS: '02' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps STATUS 04 to VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('VOIDED')
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
