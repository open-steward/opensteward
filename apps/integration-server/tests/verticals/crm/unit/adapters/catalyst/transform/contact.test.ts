import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCatalystContact,
} from '../../../../../../../src/verticals/crm/adapters/catalyst/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawCatalystContact> = {}): RawCatalystContact {
  return { id: 1, ...overrides }
}

describe('catalyst transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps string id', () => {
    expect(transformContact(makeRaw({ id: 'con_abc' })).id).toBe('con_abc')
  })

  it('maps first_name', () => {
    expect(transformContact(makeRaw({ first_name: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps last_name', () => {
    expect(transformContact(makeRaw({ last_name: 'Doe' })).last_name).toBe('Doe')
  })

  it('uses raw.name when provided', () => {
    const result = transformContact(makeRaw({ name: 'Jane Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('derives name from first+last when raw.name absent', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', last_name: 'Smith' }))
    expect(result.name).toBe('Alice Smith')
  })

  it('maps email', () => {
    const result = transformContact(makeRaw({ email: 'jane@acme.com' }))
    expect(result.email).toBe('jane@acme.com')
  })

  it('maps phone', () => {
    const result = transformContact(makeRaw({ phone: '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps mobile_phone to mobile', () => {
    const result = transformContact(makeRaw({ mobile_phone: '+14155550199' }))
    expect(result.mobile).toBe('+14155550199')
  })

  it('maps title', () => {
    const result = transformContact(makeRaw({ title: 'Head of Finance' }))
    expect(result.title).toBe('Head of Finance')
  })

  it('maps account_id to company_id as string', () => {
    const result = transformContact(makeRaw({ account_id: 10 }))
    expect(result.company_id).toBe('10')
  })

  it('maps owner_id to string', () => {
    const result = transformContact(makeRaw({ owner_id: 5 }))
    expect(result.owner_id).toBe('5')
  })

  it('maps stage', () => {
    const result = transformContact(makeRaw({ stage: 'customer' }))
    expect(result.stage).toBe('customer')
  })

  it('passes created_at and updated_at through directly', () => {
    const result = transformContact(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces output that passes ContactSchema.parse', () => {
    const raw = makeRaw({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@acme.com',
      phone: '+14155550123',
      mobile_phone: '+14155550199',
      title: 'VP Sales',
      account_id: 'co_7',
      owner_id: 'usr_3',
      stage: 'customer',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('catalyst untransformContact', () => {
  it('maps first_name', () => {
    const result = untransformContact({ first_name: 'Jane' })
    expect(result.first_name).toBe('Jane')
  })

  it('maps last_name', () => {
    const result = untransformContact({ last_name: 'Doe' })
    expect(result.last_name).toBe('Doe')
  })

  it('maps email', () => {
    const result = untransformContact({ email: 'jane@acme.com' })
    expect(result.email).toBe('jane@acme.com')
  })

  it('maps mobile to mobile_phone', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    expect(result.mobile_phone).toBe('+14155550199')
  })

  it('maps company_id to account_id', () => {
    const result = untransformContact({ company_id: 'co_7' })
    expect(result.account_id).toBe('co_7')
  })

  it('maps stage', () => {
    const result = untransformContact({ stage: 'lead' })
    expect(result.stage).toBe('lead')
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
