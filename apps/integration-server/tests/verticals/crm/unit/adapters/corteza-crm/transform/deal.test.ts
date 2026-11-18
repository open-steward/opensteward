import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawCortezaOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawCortezaOpportunity> = {}): RawCortezaOpportunity {
  return {
    recordID: 'rec-1',
    moduleID: 'mod-1',
    namespaceID: 'ns-1',
    values: [{ name: 'Name', value: 'Big Deal' }],
    ...overrides,
  }
}

// Fixture shape: the record in docs.cortezaproject.org "Working With Low Code
// Records" ({ recordID, moduleID, values: [{ name, value }], namespaceID }),
// plus createdAt/updatedAt from server/compose/types/record.go. Field names
// are the module's in corteza-server provision/700_crm/1100_modules.yaml.
describe('corteza-crm transformDeal', () => {
  const doc = makeRaw({
    recordID: '312345678901234777',
    moduleID: '212345678901234003',
    namespaceID: '112345678901234567',
    values: [
      { name: 'Name', value: 'Enterprise Deal' },
      { name: 'AccountId', value: '312345678901234001' },
      { name: 'OwnerId', value: '412345678901234567' },
      { name: 'StageName', value: 'Negotiation' },
      { name: 'CloseDate', value: '2026-03-31T00:00:00Z' },
      { name: 'Probability', value: '60' },
      { name: 'Amount', value: '25000' },
      { name: 'IsClosed', value: '0' },
    ],
    createdAt: '2026-01-01T10:00:00Z',
  })

  it('maps the documented record to a DealSchema-valid deal', () => {
    expect(DealSchema.parse(transformDeal(doc))).toMatchObject({
      id: '312345678901234777',
      title: 'Enterprise Deal',
      status: 'open',
      stage: 'Negotiation',
      stage_id: 'Negotiation',
      company_id: '312345678901234001',
      owner_id: '412345678901234567',
      close_date: '2026-03-31T00:00:00.000Z',
      probability: 60,
      created_at: '2026-01-01T10:00:00.000Z',
    })
  })

  it('emits no value: Amount has no currency field', () => {
    expect(transformDeal(doc).value).toBeUndefined()
  })

  it('does not invent contact_ids (contacts link through OpportunityContactRole)', () => {
    expect(transformDeal(doc).contact_ids).toBeUndefined()
  })

  it('IsClosed "1" and IsWon "1" is won', () => {
    const raw = makeRaw({
      values: [
        { name: 'IsClosed', value: '1' },
        { name: 'IsWon', value: '1' },
      ],
    })
    expect(DealSchema.parse(transformDeal(raw)).status).toBe('won')
  })

  it('IsClosed "1" with IsWon omitted (false) is lost', () => {
    const raw = makeRaw({ values: [{ name: 'IsClosed', value: '1' }, { name: 'IsWon' }] })
    expect(transformDeal(raw).status).toBe('lost')
  })

  it('IsClosed "1" with IsWon "0" is lost', () => {
    const raw = makeRaw({
      values: [
        { name: 'IsClosed', value: '1' },
        { name: 'IsWon', value: '0' },
      ],
    })
    expect(transformDeal(raw).status).toBe('lost')
  })

  it('IsClosed omitted is open', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('drops a probability outside 0..100', () => {
    const raw = makeRaw({ values: [{ name: 'Probability', value: '150' }] })
    expect(DealSchema.parse(transformDeal(raw)).probability).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    expect(transformDeal(doc).metadata).toBe(doc)
  })
})

describe('corteza-crm untransformDeal', () => {
  it('maps title → Name field', () => {
    const values = untransformDeal({ title: 'Big Deal' })
    expect(values.find((v) => v.name === 'Name')?.value).toBe('Big Deal')
  })

  it('maps stage_id → StageName field (prefers stage_id over stage)', () => {
    const values = untransformDeal({ stage_id: 'negotiation', stage: 'Negotiation' })
    expect(values.find((v) => v.name === 'StageName')?.value).toBe('negotiation')
  })

  it('writes IsClosed=true and IsWon=true for won status', () => {
    const values = untransformDeal({ status: 'won' })
    expect(values.find((v) => v.name === 'IsClosed')?.value).toBe('true')
    expect(values.find((v) => v.name === 'IsWon')?.value).toBe('true')
  })

  it('writes IsClosed=true and IsWon=false for lost status', () => {
    const values = untransformDeal({ status: 'lost' })
    expect(values.find((v) => v.name === 'IsClosed')?.value).toBe('true')
    expect(values.find((v) => v.name === 'IsWon')?.value).toBe('false')
  })

  it('writes IsClosed=false for open status', () => {
    const values = untransformDeal({ status: 'open' })
    expect(values.find((v) => v.name === 'IsClosed')?.value).toBe('false')
  })

  it('round-trips title and stage', () => {
    const raw = makeRaw({
      values: [
        { name: 'Name', value: 'Enterprise Deal' },
        { name: 'StageName', value: 'Proposal' },
      ],
    })
    const deal = transformDeal(raw)
    const back = untransformDeal(deal)
    expect(back.find((v) => v.name === 'Name')?.value).toBe('Enterprise Deal')
    expect(back.find((v) => v.name === 'StageName')?.value).toBe('Proposal')
  })
})
