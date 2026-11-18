/**
 * Fixture fields are Deal.v2.yaml's:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Deal.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawMoskitDeal,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/deal'

function documented(): RawMoskitDeal {
  return {
    id: 300,
    createdBy: { id: 7 },
    responsible: { id: 8 },
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    name: 'Acme expansion',
    previsionCloseDate: '2020-08-01T00:00:00.000+00:00',
    price: 1000,
    source: 'MOSKIT_API_V2',
    status: 'WON',
    closeDate: '2020-07-30T12:00:00.000+00:00',
    contacts: [{ id: 101 }, { id: 102 }],
    companies: [{ id: 20 }],
    stage: { id: 9 },
  }
}

describe('moskit transformDeal', () => {
  it('maps the documented fields and satisfies the schema', () => {
    const out = DealSchema.parse(transformDeal(documented()))
    expect(out).toMatchObject({
      id: '300',
      title: 'Acme expansion',
      status: 'won',
      stage_id: '9',
      contact_ids: ['101', '102'],
      company_id: '20',
      owner_id: '8',
      close_date: '2020-07-30T12:00:00.000Z',
      created_at: '2020-07-08T18:18:50.000Z',
    })
  })

  it('omits value: price is documented in cents but no currency is', () => {
    const out = DealSchema.parse(transformDeal(documented()))
    expect(out.value).toBeUndefined()
    expect(out.metadata['price']).toBe(1000)
  })

  it('maps each documented status', () => {
    expect(transformDeal({ ...documented(), status: 'OPEN' }).status).toBe('open')
    expect(transformDeal({ ...documented(), status: 'LOST' }).status).toBe('lost')
  })

  it('leaves company_id unset for several related companies', () => {
    const raw = { ...documented(), companies: [{ id: 20 }, { id: 21 }] }
    expect(DealSchema.parse(transformDeal(raw)).company_id).toBeUndefined()
  })

  it('parses a record with only the id', () => {
    expect(DealSchema.parse(transformDeal({ id: 1 })).id).toBe('1')
  })

  it('keeps the raw payload as metadata', () => {
    const raw = documented()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test', status: 'open' })
    expect(result.name).toBe('Test')
    expect(result.status).toBe('open')
  })
})
