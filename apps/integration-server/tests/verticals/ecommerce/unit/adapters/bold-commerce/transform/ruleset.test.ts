/**
 * Bold Price Rules ruleset → Discount. Field names from the documented
 * Ruleset schema in https://developer.boldcommerce.com/api/price-rules.openapi.yaml.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRuleset,
  type RawBoldRuleset,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/ruleset'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

const raw: RawBoldRuleset = {
  id: 42,
  public_name: 'Summer sale',
  internal_name: 'my-app',
  active: true,
  priority: 1,
  sync_percent: 100,
  product_selection: { type: 'PRODUCTS_ALL' },
  rules: [{ type: 'DISCOUNT', conditions: [], actions: [] }],
  created_at: '2021-11-04T19:09:52Z',
  updated_at: null,
  start_date: '2021-06-01T00:00:00Z',
  expiry_date: '2021-09-01T00:00:00Z',
  external_id: 'summer-2021',
  app_slug: 'my-app',
}

describe('transformRuleset (bold-commerce)', () => {
  it('maps the documented Ruleset and passes DiscountSchema', () => {
    const out = DiscountSchema.parse(transformRuleset(raw))
    expect(out).toEqual({
      id: '42',
      title: 'Summer sale',
      startsAt: '2021-06-01T00:00:00.000Z',
      endsAt: '2021-09-01T00:00:00.000Z',
      createdAt: '2021-11-04T19:09:52.000Z',
      metadata: raw,
    })
  })

  it('leaves out the dates Bold sends as null', () => {
    const out = DiscountSchema.parse(
      transformRuleset({ id: 1, active: false, rules: [], start_date: null, expiry_date: null }),
    )
    expect(out).toEqual({
      id: '1',
      metadata: { id: 1, active: false, rules: [], start_date: null, expiry_date: null },
    })
  })
})
