/**
 * Fixture: the documented example of GET /opportunities
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-opportunities-get.html,
 * "Example of Response Body"), plus documented `opportunities-item-response`
 * attributes the example omits.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  DEAL_FIELDS,
  transformDeal,
  untransformDeal,
  type RawOracleCxDeal,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/deal'

const DOC_EXAMPLE: RawOracleCxDeal = {
  PrimaryOrganizationId: 204,
  ChampionFlag: false,
  CreatedBy: 'UPGRADE:SEBL:1-KHL3',
  CreationDate: '2009-05-11T00:09:56-07:00',
  CurrencyCode: 'USD',
  SalesMethodId: 100000012430009,
  SalesStageId: 100000012430010,
  LastUpdatedBy: 'SALES_ADMIN',
  LastUpdateLogin: null,
  Name: 'Major upgrade of legacy application',
  OptyId: 999997817606460,
  OptyNumber: '3-EBS-2285',
}

describe('oracle-cx transformDeal', () => {
  it('maps the documented example and parses against DealSchema', () => {
    const out = DealSchema.parse(transformDeal(DOC_EXAMPLE))
    expect(out).toMatchObject({
      id: '999997817606460',
      title: 'Major upgrade of legacy application',
      stage_id: '100000012430010',
      created_at: '2009-05-11T07:09:56.000Z',
    })
    // The example carries a currency but no Revenue: no money is invented.
    expect(out.value).toBeUndefined()
    expect(out.metadata).toEqual(DOC_EXAMPLE)
  })

  it('reads the documented revenue, status, stage, account, owner, close date and probability', () => {
    const out = DealSchema.parse(
      transformDeal({
        ...DOC_EXAMPLE,
        Revenue: 125000,
        StatusCode: 'OPEN',
        SalesStage: '02 - Qualify',
        TargetPartyId: 999997549785817,
        OwnerResourcePartyId: 300100174752464,
        EffectiveDate: '2026-03-31',
        WinProb: 40,
      }),
    )
    expect(out).toMatchObject({
      value: { amount: 125000, currency: 'USD' },
      status: 'OPEN',
      stage: '02 - Qualify',
      company_id: '999997549785817',
      owner_id: '300100174752464',
      close_date: '2026-03-31T00:00:00.000Z',
      probability: 40,
    })
  })

  it('omits value when the currency is missing rather than defaulting one', () => {
    const out = transformDeal({ OptyId: 1, Name: 'n', Revenue: 10 })
    expect(out.value).toBeUndefined()
  })

  it('ignores the undocumented OwnerPartyId and CloseDate it used to read', () => {
    const out = transformDeal({ OptyId: 1, Name: 'n', OwnerPartyId: 5, CloseDate: '2026-01-01' })
    expect(out.owner_id).toBeUndefined()
    expect(out.close_date).toBeUndefined()
  })

  it('requests exactly the documented attributes it reads', () => {
    expect(DEAL_FIELDS.split(',')).toEqual([
      'OptyId',
      'Name',
      'Revenue',
      'CurrencyCode',
      'StatusCode',
      'SalesStage',
      'SalesStageId',
      'TargetPartyId',
      'OwnerResourcePartyId',
      'EffectiveDate',
      'WinProb',
      'CreationDate',
      'LastUpdateDate',
    ])
  })
})

describe('oracle-cx untransformDeal', () => {
  it('maps title to Name', () => {
    const result = untransformDeal({ title: 'New Opp' })
    expect(result.Name).toBe('New Opp')
  })
})
