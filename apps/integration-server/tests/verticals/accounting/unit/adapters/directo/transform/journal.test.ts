import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type DirectoTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<DirectoTransaction> = {}): DirectoTransaction {
  return {
    number: '3001',
    type: 'FIN',
    date: '2024-04-01',
    reference: 'REF-100',
    description: 'Opening balance',
    rows: [
      {
        rn: 1,
        account: '1000',
        debitamount: 500,
        creditamount: 0,
        description: 'Cash debit',
        project: 'PROJ-A',
      },
    ],
    ...overrides,
  }
}

describe('directo transformJournal', () => {
  it('maps number to id as string', () => {
    const result = transformJournal(makeRaw({ number: 7 }))
    expect(result.id).toBe('7')
  })

  it('maps type to source', () => {
    const result = transformJournal(makeRaw({ type: 'FIN' }))
    expect(result.source).toBe('FIN')
  })

  it('maps description', () => {
    const result = transformJournal(makeRaw({ description: 'Test entry' }))
    expect(result.description).toBe('Test entry')
  })

  it('maps reference', () => {
    const result = transformJournal(makeRaw({ reference: 'REF-99' }))
    expect(result.reference).toBe('REF-99')
  })

  it('maps row rn to lineitem id', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.id).toBe('1')
  })

  it('maps row account to lineitem accountId', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.accountId).toBe('1000')
  })

  it('maps row project to lineitem projectId', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.projectId).toBe('PROJ-A')
  })

  it('maps row debitamount', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.debitAmount).toBe(500)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformJournal(makeRaw({ date: '2024-05-10' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})

describe('directo untransformJournal', () => {
  it('sets type to FIN', () => {
    const result = untransformJournal({ description: 'x' })
    expect(result.type).toBe('FIN')
  })

  it('maps description', () => {
    const result = untransformJournal({ description: 'My journal' })
    expect(result.description).toBe('My journal')
  })

  it('formats postedAt to date string', () => {
    const result = untransformJournal({ postedAt: new Date('2024-07-20T00:00:00.000Z') })
    expect(result.date).toBe('2024-07-20')
  })
})
