import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformJournal,
  untransformJournal,
  type YukiJournal,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<YukiJournal> = {}): YukiJournal {
  return {
    DocumentSubject: 'Sales revenue recognition — INV-2026-001',
    JournalType: 'GeneralJournal',
    AdministrationID: 'ADM-001',
    Entries: [
      {
        GLAccount: '1300',
        Amount: '1210.00',
        Description: 'Accounts receivable',
        ContactCode: 'C-001',
        EntryDate: '2026-02-01',
      },
      {
        GLAccount: '8000',
        Amount: '-1000.00',
        Description: 'Revenue',
        ContactCode: '',
        EntryDate: '2026-02-01',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal (yuki)', () => {
  it('maps DocumentSubject to id', () => {
    expect(transformJournal(makeRaw()).id).toBe('Sales revenue recognition — INV-2026-001')
  })

  it('maps DocumentSubject to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Sales revenue recognition — INV-2026-001')
  })

  it('maps JournalType to source', () => {
    expect(transformJournal(makeRaw()).source).toBe('GeneralJournal')
  })

  it('maps first entry EntryDate to postedAt', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('creates one lineitem per entry', () => {
    expect(transformJournal(makeRaw()).lineItems).toHaveLength(2)
  })

  it('maps positive Amount to debitAmount', () => {
    const li = transformJournal(makeRaw()).lineItems?.[0]
    expect(li?.debitAmount).toBe(1210)
    expect(li?.creditAmount).toBeUndefined()
  })

  it('maps negative Amount to creditAmount', () => {
    const li = transformJournal(makeRaw()).lineItems?.[1]
    expect(li?.creditAmount).toBe(1000)
    expect(li?.debitAmount).toBeUndefined()
  })

  it('maps GLAccount to accountId in lineItems', () => {
    expect(transformJournal(makeRaw()).lineItems?.[0]?.accountId).toBe('1300')
  })

  it('maps ContactCode to contactId when present', () => {
    expect(transformJournal(makeRaw()).lineItems?.[0]?.contactId).toBe('C-001')
  })

  it('omits contactId when ContactCode is empty string', () => {
    expect(transformJournal(makeRaw()).lineItems?.[1]?.contactId).toBeUndefined()
  })

  it('produces a schema-valid Journal', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRaw()))).not.toThrow()
  })

  describe('untransformJournal', () => {
    it('produces XML containing DocumentSubject', () => {
      const xml = untransformJournal(
        {
          description: 'Revenue entry',
          postedAt: new Date('2026-02-01T00:00:00.000Z'),
          lineItems: [{ accountId: '8000', debitAmount: 500 }],
        },
        'ADM-001',
      )
      expect(xml).toContain('<DocumentSubject>Revenue entry</DocumentSubject>')
    })

    it('includes AdministrationID in XML', () => {
      const xml = untransformJournal({ lineItems: [] }, 'ADM-001')
      expect(xml).toContain('<AdministrationID>ADM-001</AdministrationID>')
    })

    it('uses debitAmount as positive Amount', () => {
      const xml = untransformJournal(
        {
          postedAt: new Date('2026-02-01T00:00:00.000Z'),
          lineItems: [{ accountId: '1300', debitAmount: 1210 }],
        },
        'ADM-001',
      )
      expect(xml).toContain('<Amount>1210</Amount>')
    })

    it('uses negative creditAmount as Amount', () => {
      const xml = untransformJournal(
        {
          postedAt: new Date('2026-02-01T00:00:00.000Z'),
          lineItems: [{ accountId: '8000', creditAmount: 1000 }],
        },
        'ADM-001',
      )
      expect(xml).toContain('<Amount>-1000</Amount>')
    })
  })
})
