import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  transformDealV2,
  untransformDeal,
  type RawPipedriveDeal,
  type RawPipedriveV2Deal,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/deal'

const raw: RawPipedriveDeal = {
  id: 99,
  title: 'Big Deal',
  value: 5000,
  currency: 'USD',
  status: 'open',
  stage_id: 3,
  pipeline_id: 1,
  person_id: { value: 42, name: 'Jane Doe' },
  org_id: { value: 7, name: 'Acme Corp' },
  user_id: { id: 1, name: 'Rep' },
  // Pipedrive's v1 API documents these as UTC but formats them
  // space-separated with no offset (e.g. "2019-11-27 11:40:36") — never
  // as full ISO 8601 with a `Z` or `+HH:MM` suffix.
  close_time: '2025-01-01 16:45:00',
  probability: 60,
  add_time: '2024-01-01 00:00:00',
  update_time: '2024-06-01 00:00:00',
}

describe('transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(raw).id).toBe('99')
  })

  it('maps value with currency', () => {
    expect(transformDeal(raw).value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps contact_ids from person_id', () => {
    expect(transformDeal(raw).contact_ids).toEqual(['42'])
  })

  it('maps company_id from org_id', () => {
    expect(transformDeal(raw).company_id).toBe('7')
  })

  it('maps owner_id from user_id', () => {
    expect(transformDeal(raw).owner_id).toBe('1')
  })

  it('maps probability', () => {
    expect(transformDeal(raw).probability).toBe(60)
  })

  it('maps close_date from close_time as a strict ISO datetime', () => {
    // Pipedrive's space-separated, offset-less timestamp is documented UTC —
    // this must resolve to the same instant regardless of the host's local
    // timezone (run this file under TZ=UTC / TZ=Asia/Tokyo /
    // TZ=America/New_York to confirm).
    expect(transformDeal(raw).close_date).toBe('2025-01-01T16:45:00.000Z')
  })

  it('maps created_at/updated_at from add_time/update_time as strict ISO datetimes', () => {
    expect(transformDeal(raw).created_at).toBe('2024-01-01T00:00:00.000Z')
    expect(transformDeal(raw).updated_at).toBe('2024-06-01T00:00:00.000Z')
  })

  it('puts raw in metadata', () => {
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDeal', () => {
  it('maps value.amount', () => {
    const out = untransformDeal({ value: { amount: 1000, currency: 'EUR' } })
    expect(out.value).toBe(1000)
    expect(out.currency).toBe('EUR')
  })

  it('maps contact_ids[0] to person_id', () => {
    const out = untransformDeal({ contact_ids: ['5'] })
    expect(out.person_id).toBe(5)
  })

  it('omits missing fields', () => {
    const out = untransformDeal({ title: 'Test' })
    expect(out.value).toBeUndefined()
  })
})

describe('transformDeal money (v1 write responses)', () => {
  it('omits value rather than inventing a currency', () => {
    expect(transformDeal({ id: 1, title: 'T', value: 10 }).value).toBeUndefined()
  })
})

/**
 * The documented example item of GET /api/v2/deals (getDeals,
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml), verbatim.
 */
const v2Example: RawPipedriveV2Deal = {
  id: 1,
  title: 'Deal Title',
  creator_user_id: 1,
  owner_id: 1,
  value: 200,
  person_id: 1,
  org_id: 1,
  stage_id: 1,
  pipeline_id: 1,
  currency: 'USD',
  archive_time: '2021-01-01T00:00:00Z',
  add_time: '2021-01-01T00:00:00Z',
  update_time: '2021-01-01T00:00:00Z',
  stage_change_time: '2021-01-01T00:00:00Z',
  status: 'open',
  is_archived: false,
  is_deleted: false,
  probability: 90,
  lost_reason: 'Lost Reason',
  visible_to: 7,
  close_time: '2021-01-01T00:00:00Z',
  won_time: '2021-01-01T00:00:00Z',
  lost_time: '2021-01-01T00:00:00Z',
  local_won_date: '2021-01-01',
  local_lost_date: '2021-01-01',
  local_close_date: '2021-01-01',
  expected_close_date: '2021-01-01',
  label_ids: [1, 2, 3],
  origin: 'ManuallyCreated',
  origin_id: null,
  channel: 52,
  channel_id: 'Jun23 Billboards',
  source_lead_id: '35b0d604-eb0d-42d0-be11-eac8832051f0',
  acv: 120,
  arr: 120,
  mrr: 10,
  custom_fields: {},
}

describe('transformDealV2 (GET /api/v2/deals)', () => {
  it('maps the documented example and satisfies DealSchema', () => {
    const out = DealSchema.parse(transformDealV2(v2Example))
    expect(out).toMatchObject({
      id: '1',
      title: 'Deal Title',
      value: { amount: 200, currency: 'USD' },
      status: 'open',
      stage_id: '1',
      pipeline_id: '1',
      contact_ids: ['1'],
      company_id: '1',
      owner_id: '1',
      probability: 90,
      close_date: '2021-01-01T00:00:00.000Z',
      created_at: '2021-01-01T00:00:00.000Z',
      updated_at: '2021-01-01T00:00:00.000Z',
    })
    expect(out.metadata).toEqual(v2Example)
  })

  it('reads the plain-integer person_id, org_id and owner_id v2 returns', () => {
    const out = transformDealV2({ id: 2, title: 'T', person_id: 11, org_id: 12, owner_id: 13 })
    expect(out.contact_ids).toEqual(['11'])
    expect(out.company_id).toBe('12')
    expect(out.owner_id).toBe('13')
  })

  it('keeps the currency the deal carries', () => {
    expect(transformDealV2({ id: 3, title: 'T', value: 5, currency: 'EUR' }).value).toEqual({
      amount: 5,
      currency: 'EUR',
    })
  })

  it('omits value when the currency is missing, and never defaults one', () => {
    expect(transformDealV2({ id: 4, title: 'T', value: 5 }).value).toBeUndefined()
    expect(transformDealV2({ id: 4, title: 'T', value: 5, currency: null }).value).toBeUndefined()
  })

  it('omits value when the amount is missing, and never writes 0', () => {
    expect(transformDealV2({ id: 5, title: 'T', currency: 'USD' }).value).toBeUndefined()
  })

  it('falls back to expected_close_date for an open deal with no close_time', () => {
    const out = transformDealV2({
      id: 6,
      title: 'T',
      close_time: null,
      expected_close_date: '2026-03-31',
    })
    expect(out.close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('omits a null probability', () => {
    expect(
      DealSchema.parse(transformDealV2({ id: 7, title: 'T', probability: null })).probability,
    ).toBeUndefined()
  })
})
