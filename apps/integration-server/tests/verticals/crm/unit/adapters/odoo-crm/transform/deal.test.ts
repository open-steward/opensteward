/** Fixtures follow Odoo's documented read format; see contact.test.ts. */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawOdooDeal,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/deal'

const DEAL: RawOdooDeal = {
  id: 42,
  name: 'Acme Q1 Expansion',
  expected_revenue: 12000.5,
  company_currency: [1, 'EUR'],
  date_deadline: '2026-03-31',
  stage_id: [3, 'Proposition'],
  team_id: [1, 'Sales'],
  partner_id: [26, 'Acme Industries, Jane Doe'],
  commercial_partner_id: [14, 'Acme Industries'],
  user_id: [2, 'Mitchell Admin'],
  probability: 60,
  won_status: 'pending',
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-02-01 14:20:00',
}

describe('odoo-crm transformDeal', () => {
  it('maps a documented crm.lead row onto the canonical deal', () => {
    const out = DealSchema.parse(transformDeal(DEAL))
    expect(out).toMatchObject({
      id: '42',
      title: 'Acme Q1 Expansion',
      value: { amount: 12000.5, currency: 'EUR' },
      status: 'pending',
      stage: 'Proposition',
      stage_id: '3',
      pipeline_id: '1',
      contact_ids: ['26'],
      company_id: '14',
      owner_id: '2',
      close_date: '2026-03-31T00:00:00.000Z',
      probability: 60,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
  })

  it('takes the currency from company_currency, never a default', () => {
    const out = DealSchema.parse(transformDeal({ ...DEAL, company_currency: false }))
    expect(out.value).toBeUndefined()
  })

  it('keeps a real zero revenue when its currency is known', () => {
    const out = DealSchema.parse(transformDeal({ ...DEAL, expected_revenue: 0 }))
    expect(out.value).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('omits value when the currency does not read as an ISO 4217 code', () => {
    // res.currency.name: "Currency Code (ISO 4217)", size=3.
    const out = DealSchema.parse(transformDeal({ ...DEAL, company_currency: [1, 'Euro'] }))
    expect(out.value).toBeUndefined()
  })

  it('omits a negative revenue, which the canonical MoneySchema (amount ≥ 0) cannot hold', () => {
    const out = DealSchema.parse(transformDeal({ ...DEAL, expected_revenue: -5 }))
    expect(out.value).toBeUndefined()
  })

  it('omits value when the amount is missing', () => {
    const { expected_revenue: _omit, ...rest } = DEAL
    expect(DealSchema.parse(transformDeal(rest as RawOdooDeal)).value).toBeUndefined()
  })

  it('throws rather than inventing a title', () => {
    expect(() => transformDeal({ id: 1, name: false })).toThrow(/no name/)
  })
})

describe('odoo-crm untransformDeal', () => {
  it('always sets type opportunity', () => {
    expect(untransformDeal({ title: 'x' }).type).toBe('opportunity')
  })
})
