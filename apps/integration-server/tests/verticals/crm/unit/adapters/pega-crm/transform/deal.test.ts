import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawPegaOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/pega-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawPegaOpportunity> = {}): RawPegaOpportunity {
  return {
    pzInsKey: 'OPP-99',
    pyID: 'O-99',
    pyLabel: 'Acme Q1 Expansion',
    pyValue: '500.00',
    pyCurrencyCode: 'USD',
    pyStageLabel: 'Negotiation',
    pyStage: 'stage_negotiation',
    pyStatusWork: 'Open-Qualified',
    pyCloseDate: '20260331T000000.000 GMT',
    pyProbability: '60',
    pyOwner: 'operator1',
    AccountID: 'ACCT-7',
    ContactID: 'CONT-42',
    pxCreateDateTime: '20260115T093000.000 GMT',
    pxUpdateDateTime: '20260120T120000.000 GMT',
    ...overrides,
  }
}

describe('pega-crm transformDeal', () => {
  it('maps id from pzInsKey', () => {
    expect(transformDeal(makeRaw()).id).toBe('OPP-99')
  })

  it('falls back to pyID when pzInsKey absent', () => {
    expect(transformDeal(makeRaw({ pzInsKey: undefined })).id).toBe('O-99')
  })

  it('maps title from pyLabel', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('converts pyValue major units to minor units (cents)', () => {
    // 500.00 USD → 50000 cents
    expect(transformDeal(makeRaw()).value?.amount).toBe(50000)
  })

  it('maps currency from pyCurrencyCode', () => {
    expect(transformDeal(makeRaw()).value?.currency).toBe('USD')
  })

  it('defaults currency to USD when pyCurrencyCode absent', () => {
    const result = transformDeal(makeRaw({ pyCurrencyCode: undefined }))
    expect(result.value?.currency).toBe('USD')
  })

  it('maps stage label from pyStageLabel', () => {
    expect(transformDeal(makeRaw()).stage).toBe('Negotiation')
  })

  it('maps stage_id from pyStage', () => {
    expect(transformDeal(makeRaw()).stage_id).toBe('stage_negotiation')
  })

  it('maps status from pyStatusWork', () => {
    expect(transformDeal(makeRaw()).status).toBe('Open-Qualified')
  })

  it('maps company_id from AccountID', () => {
    expect(transformDeal(makeRaw()).company_id).toBe('ACCT-7')
  })

  it('maps contact_ids from ContactID as single-element array', () => {
    expect(transformDeal(makeRaw()).contact_ids).toEqual(['CONT-42'])
  })

  it('maps probability from pyProbability string', () => {
    expect(transformDeal(makeRaw()).probability).toBe(60)
  })

  it('maps probability from numeric pyProbability', () => {
    expect(transformDeal(makeRaw({ pyProbability: 75 })).probability).toBe(75)
  })

  it('parses Pega compact datetime for close_date', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('parses Pega compact datetime for created_at', () => {
    expect(transformDeal(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal round-trips title to pyLabel', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect((result as { content: Record<string, unknown> }).content.pyLabel).toBe('New Deal')
  })

  it('untransformDeal converts minor units back to major unit string', () => {
    // 50000 cents → "500.00"
    const result = untransformDeal({ value: { amount: 50000, currency: 'USD' } })
    expect((result as { content: Record<string, unknown> }).content.pyValue).toBe('500.00')
  })
})
