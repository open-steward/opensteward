import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawRespondIoDeal,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

describe('respond-io transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal({ id: 55 }).id).toBe('55')
  })

  it('maps title, falling back to empty string', () => {
    expect(transformDeal({ id: '1', title: 'Big Deal' }).title).toBe('Big Deal')
    expect(transformDeal({ id: '1' }).title).toBe('')
  })

  it('maps contactId to contact_ids array', () => {
    const result = transformDeal({ id: '1', contactId: 42 })
    expect(result.contact_ids).toEqual(['42'])
  })

  it('leaves contact_ids undefined when contactId absent', () => {
    expect(transformDeal({ id: '1' }).contact_ids).toBeUndefined()
  })

  it('preserves raw metadata', () => {
    const raw: RawRespondIoDeal = { id: '3', title: 'X' }
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawRespondIoDeal = { id: '9', title: 'Enterprise Deal', contactId: '22' }
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('respond-io untransformDeal', () => {
  it('maps title', () => {
    expect(untransformDeal({ title: 'Big Deal' })).toMatchObject({ title: 'Big Deal' })
  })

  it('omits unset fields', () => {
    expect(untransformDeal({})).not.toHaveProperty('title')
  })
})
