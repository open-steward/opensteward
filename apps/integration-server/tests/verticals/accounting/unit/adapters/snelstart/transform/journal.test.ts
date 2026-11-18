import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type SnelStartBoeking,
  type SnelStartBoekingRegel,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/journal'

function makeLine(overrides: Partial<SnelStartBoekingRegel> = {}): SnelStartBoekingRegel {
  return {
    id: 'regel-1',
    omschrijving: 'Omzet binnenland',
    grootboekrekening: { id: 'acc-8000' },
    debet: 5000,
    credit: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<SnelStartBoeking> = {}): SnelStartBoeking {
  return {
    id: 'boek-001',
    omschrijving: 'Maandafsluiting',
    boekstuknummer: 'BS-42',
    datum: '2024-01-31',
    boekingsregels: [
      makeLine(),
      makeLine({ id: 'regel-2', grootboekrekening: { id: 'acc-1300' }, debet: 0, credit: 5000, omschrijving: 'Debiteuren' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('boek-001')
  })

  it('maps omschrijving to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Maandafsluiting')
  })

  it('maps boekstuknummer to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('BS-42')
  })

  it('maps datum to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when datum is empty', () => {
    expect(transformJournal(makeJournal({ datum: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined description when omschrijving is empty', () => {
    expect(transformJournal(makeJournal({ omschrijving: '' })).description).toBeUndefined()
  })

  it('maps boekingsregels to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('regel-1')
    expect(debitLine.accountId).toBe('acc-8000')
    expect(debitLine.description).toBe('Omzet binnenland')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('regel-2')
    expect(creditLine.accountId).toBe('acc-1300')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('returns empty lineItems when boekingsregels is empty', () => {
    const j = transformJournal(makeJournal({ boekingsregels: [] }))
    expect(j.lineItems).toHaveLength(0)
  })

  it('maps grootboekrekening.id to accountId in lineItems', () => {
    const j = transformJournal(makeJournal({ boekingsregels: [makeLine({ grootboekrekening: { id: 'acc-9999' } })] }))
    expect(j.lineItems![0].accountId).toBe('acc-9999')
  })

  it('returns undefined accountId when grootboekrekening is null', () => {
    const j = transformJournal(makeJournal({ boekingsregels: [makeLine({ grootboekrekening: null })] }))
    expect(j.lineItems![0].accountId).toBeUndefined()
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
