import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type CertiniaJournal } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/journal'

function makeJournal(overrides: Partial<CertiniaJournal> = {}): CertiniaJournal {
  return {
    Id: 'JE0000000001',
    Name: 'JE-2024-001',
    Journal_Date__c: '2024-03-15',
    Description__c: 'Quarterly adjustment',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformJournal (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('JE0000000001')
    expect(result.description).toBe('Quarterly adjustment')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('maps Lines__r records to lineItems', () => {
    const raw = makeJournal({
      Lines__r: {
        records: [
          { Id: 'L1', Account_Code__c: '4000', Description__c: 'Revenue', Debit__c: 1000, Credit__c: 0 },
          { Id: 'L2', Account_Code__c: '1000', Description__c: 'Cash', Debit__c: 0, Credit__c: 1000 },
        ],
      },
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
    expect(result.lineItems![0].accountId).toBe('4000')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformJournal(makeJournal({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
