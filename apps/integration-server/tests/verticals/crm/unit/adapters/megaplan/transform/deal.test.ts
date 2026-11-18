import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawMegaplanDeal,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawMegaplanDeal> = {}): RawMegaplanDeal {
  return { id: '1', ...overrides }
}

describe('megaplan transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big contract' })).title).toBe('Big contract')
  })

  it('converts major-unit amount to minor-unit value (×100)', () => {
    // 1500.00 major units → 150000 minor units
    const result = transformDeal(makeRaw({ amount: 1500, amountCurrency: 'RUB' }))
    expect(result.value?.amount).toBe(150000)
    expect(result.value?.currency).toBe('RUB')
  })

  it('parses string amount', () => {
    const result = transformDeal(makeRaw({ amount: '2500.50', amountCurrency: 'USD' }))
    expect(result.value?.amount).toBe(250050)
  })

  it('defaults currency to RUB when amountCurrency absent', () => {
    const result = transformDeal(makeRaw({ amount: 100 }))
    expect(result.value?.currency).toBe('RUB')
  })

  it('returns undefined value when amount is absent', () => {
    expect(transformDeal(makeRaw()).value).toBeUndefined()
  })

  it('lowercases status', () => {
    expect(transformDeal(makeRaw({ status: 'Active' })).status).toBe('active')
  })

  it('maps schemeStage.name to stage', () => {
    const result = transformDeal(makeRaw({ schemeStage: { id: '5', name: 'Negotiation' } }))
    expect(result.stage).toBe('Negotiation')
    expect(result.stage_id).toBe('5')
  })

  it('maps program.id to pipeline_id', () => {
    expect(transformDeal(makeRaw({ program: { id: '7', name: 'Sales' } })).pipeline_id).toBe('7')
  })

  it('maps contractor.id to company_id', () => {
    expect(
      transformDeal(makeRaw({ contractor: { id: '20', contentType: 'Contractor' } })).company_id,
    ).toBe('20')
  })

  it('maps responsible.id to owner_id', () => {
    expect(
      transformDeal(makeRaw({ responsible: { id: '3', contentType: 'Employee' } })).owner_id,
    ).toBe('3')
  })

  it('falls back to first responsibles entry when responsible absent', () => {
    expect(
      transformDeal(makeRaw({ responsibles: [{ id: '4', contentType: 'Employee' }] })).owner_id,
    ).toBe('4')
  })

  it('maps probability', () => {
    expect(transformDeal(makeRaw({ probability: 75 })).probability).toBe(75)
  })

  it('maps expectedCloseDate to close_date', () => {
    const result = transformDeal(makeRaw({ expectedCloseDate: '2024-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2024-12-31T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw: RawMegaplanDeal = {
      id: '42',
      name: 'Enterprise contract',
      amount: 1500,
      amountCurrency: 'RUB',
      status: 'active',
      probability: 60,
      contractor: { id: '20', contentType: 'Contractor' },
      responsible: { id: '3', contentType: 'Employee' },
      program: { id: '7', name: 'Sales Funnel' },
      schemeStage: { id: '5', name: 'Negotiation' },
      expectedCloseDate: '2024-12-31T00:00:00.000Z',
      timeCreated: '2024-01-15T09:30:00.000Z',
      timeUpdated: '2024-02-01T14:20:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('megaplan untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Big contract' }).name).toBe('Big contract')
  })

  it('converts minor-unit amount back to major units (÷100)', () => {
    // 150000 minor → 1500 major
    const result = untransformDeal({ value: { amount: 150000, currency: 'RUB' } })
    expect(result.amount).toBe(1500)
    expect(result.amountCurrency).toBe('RUB')
  })

  it('maps status', () => {
    expect(untransformDeal({ status: 'won' }).status).toBe('won')
  })

  it('maps company_id to contractor object', () => {
    expect(untransformDeal({ company_id: '20' }).contractor).toEqual({ id: '20' })
  })

  it('maps owner_id to responsible object', () => {
    expect(untransformDeal({ owner_id: '3' }).responsible).toEqual({ id: '3' })
  })

  it('maps stage_id to schemeStage object', () => {
    expect(untransformDeal({ stage_id: '5' }).schemeStage).toEqual({ id: '5' })
  })

  it('maps pipeline_id to program object', () => {
    expect(untransformDeal({ pipeline_id: '7' }).program).toEqual({ id: '7' })
  })
})
