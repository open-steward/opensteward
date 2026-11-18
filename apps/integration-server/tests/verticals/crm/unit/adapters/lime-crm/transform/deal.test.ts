/**
 * Fixture from the documented Deal definition
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject): `name`, `company`
 * ("type: integer"), `dealstatus` ("title: Status", with `id`, `key` and
 * `text`), `value` ("title: Value", "type: string"), plus the system
 * properties `_id` ("the id of the limeobject") and `_createdtime`
 * (https://platform.docs.lime-crm.com/en/latest/development/tutorials/concepts/limetypes-and-limeobjects/).
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  type RawLimeCrmDeal,
} from '../../../../../../../src/verticals/crm/adapters/lime-crm/transform/deal'

const raw: RawLimeCrmDeal = {
  _id: 1010,
  _createdtime: '2024-01-15T09:00:00Z',
  _timestamp: '2024-02-01T10:30:00+01:00',
  name: 'Software License',
  company: 1001,
  dealstatus: { id: 3, key: 'tender', text: 'Tender' },
  value: '95000',
  probability: '0.5',
}

describe('lime-crm transformDeal', () => {
  it('maps the documented fields', () => {
    const deal = DealSchema.parse(transformDeal(raw))
    expect(deal.id).toBe('1010')
    expect(deal.title).toBe('Software License')
    expect(deal.company_id).toBe('1001')
    expect(deal.stage_id).toBe('tender')
    expect(deal.stage).toBe('Tender')
    expect(deal.created_at).toBe('2024-01-15T09:00:00.000Z')
    expect(deal.updated_at).toBe('2024-02-01T09:30:00.000Z')
    expect(deal.metadata).toEqual(raw)
  })

  it('omits value: Lime documents no currency for it', () => {
    const deal = DealSchema.parse(transformDeal(raw))
    expect(deal.value).toBeUndefined()
  })

  it('a deal without status or company parses with neither', () => {
    const deal = DealSchema.parse(
      transformDeal({ _id: 5, name: 'Bare', dealstatus: null, company: null }),
    )
    expect(deal.stage_id).toBeUndefined()
    expect(deal.stage).toBeUndefined()
    expect(deal.company_id).toBeUndefined()
  })

  it('a deal without _id is an error, not the id "undefined"', () => {
    expect(() => transformDeal({ name: 'X' } as unknown as RawLimeCrmDeal)).toThrow(/_id/)
  })
})
