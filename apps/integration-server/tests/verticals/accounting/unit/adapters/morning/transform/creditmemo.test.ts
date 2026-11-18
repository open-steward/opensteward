import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/creditmemo'
import type { MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'cm_001',
    type: 330,
    status: 1,
    number: 'CM-001',
    sum: 500,
    vat: 85,
    currency: 'ILS',
    date: '2024-03-05',
    dueDate: '2024-03-20',
    client: { id: 'client_3' },
    ...overrides,
  }
}

describe('transformCreditMemo (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeDocument())
    expect(result.id).toBe('cm_001')
    expect(result.creditmemoNumber).toBe('CM-001')
    expect(result.contactId).toBe('client_3')
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(85)
    expect(result.currency).toBe('ILS')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
    expect(result.dueAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformCreditMemo(makeDocument({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status -1 to VOIDED', () => {
    const result = transformCreditMemo(makeDocument({ status: -1 }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeDocument())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
