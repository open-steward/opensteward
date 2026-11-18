import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type AccountingSeedJournal,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/journal'

function makeJournal(overrides: Partial<AccountingSeedJournal> = {}): AccountingSeedJournal {
  return {
    Id: 'a0G5e000006PQR1',
    Name: 'JE-0001',
    AcctSeed__Description__c: 'Monthly adjustment',
    AcctSeed__Reference__c: 'ADJ-2024-03',
    AcctSeed__Source__c: 'Manual',
    CurrencyIsoCode: 'USD',
    AcctSeed__Tax_Amount__c: 0,
    AcctSeed__Journal_Entry_Lines__r: {
      records: [
        {
          Id: 'jeline-001',
          AcctSeed__GL_Account__c: 'gl-debit',
          AcctSeed__Contact__c: 'cont-001',
          AcctSeed__Project__c: 'proj-001',
          AcctSeed__Debit__c: 1000,
          AcctSeed__Credit__c: 0,
          AcctSeed__Description__c: 'Debit entry',
        },
        {
          Id: 'jeline-002',
          AcctSeed__GL_Account__c: 'gl-credit',
          AcctSeed__Contact__c: '',
          AcctSeed__Project__c: '',
          AcctSeed__Debit__c: 0,
          AcctSeed__Credit__c: 1000,
          AcctSeed__Description__c: 'Credit entry',
        },
      ],
    },
    AcctSeed__Date__c: '2024-03-31',
    CreatedDate: '2024-03-31T16:00:00.000Z',
    LastModifiedDate: '2024-03-31T16:30:00.000Z',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from Id', () => {
    expect(transformJournal(makeJournal()).id).toBe('a0G5e000006PQR1')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly adjustment')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('ADJ-2024-03')
  })

  it('maps source', () => {
    expect(transformJournal(makeJournal()).source).toBe('Manual')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps line items', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![0].creditAmount).toBe(0)
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('maps journal line accountId and contactId', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems![0].accountId).toBe('gl-debit')
    expect(result.lineItems![0].contactId).toBe('cont-001')
    expect(result.lineItems![0].projectId).toBe('proj-001')
  })

  it('maps postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
