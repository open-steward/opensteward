import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/transform/deal'
import { documentedRecord } from '../fixtures'

describe('nethunt-crm transformDeal (v2 Record)', () => {
  it('maps the documented example record and parses as a Deal', () => {
    const raw = documentedRecord()
    const out = DealSchema.parse(transformDeal(raw))
    expect(out.id).toBe('5f8a2b1c3d4e5f6a7b8c9d0e')
    expect(out.title).toBe('Acme Corp')
    expect(out.created_at).toBe('2025-03-18T10:00:00.000Z')
    expect(out.updated_at).toBe('2025-03-19T14:23:11.000Z')
    expect(out.metadata).toEqual(raw)
  })

  it('guesses no money, stage or status from custom fields', () => {
    const out = transformDeal(documentedRecord())
    expect(out.value).toBeUndefined()
    expect(out.status).toBeUndefined()
    expect(out.stage).toBeUndefined()
  })

  it('refuses a record with no name rather than inventing a title', () => {
    expect(() => transformDeal(documentedRecord({ fields: {} }))).toThrow(/has no name/)
  })
})

describe('nethunt-crm untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Big' })).toEqual({ name: 'Big' })
  })
})
