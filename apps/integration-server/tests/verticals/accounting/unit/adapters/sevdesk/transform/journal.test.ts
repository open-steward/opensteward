import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type SevDeskAccountingContact,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/journal'

function makeJournal(overrides: Partial<SevDeskAccountingContact> = {}): SevDeskAccountingContact {
  return {
    id: 'jrn-1',
    object: { id: 'inv-1', objectName: 'Invoice' },
    bookingDate: '2024-06-01',
    amount: 500,
    currency: 'EUR',
    comment: 'Payment received',
    entryType: { id: 'et-1', objectName: 'EntryType' },
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrn-1')
  })

  it('maps comment to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Payment received')
  })

  it('maps currency correctly', () => {
    expect(transformJournal(makeJournal()).currency).toBe('EUR')
  })

  it('parses bookingDate as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('produces one lineitem', () => {
    expect(transformJournal(makeJournal()).lineItems).toHaveLength(1)
  })

  it('maps positive amount as debit', () => {
    const j = transformJournal(makeJournal({ amount: 500 }))
    expect(j.lineItems![0].debitAmount).toBe(500)
    expect(j.lineItems![0].creditAmount).toBeUndefined()
  })

  it('maps negative amount as credit', () => {
    const j = transformJournal(makeJournal({ amount: -300 }))
    expect(j.lineItems![0].creditAmount).toBe(300)
    expect(j.lineItems![0].debitAmount).toBeUndefined()
  })

  it('maps lineitem totalAmount from amount', () => {
    expect(transformJournal(makeJournal()).lineItems![0].totalAmount).toBe(500)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
