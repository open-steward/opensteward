import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawMazricaContact,
} from '../../../../../../../src/verticals/crm/adapters/mazrica/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawMazricaContact> = {}): RawMazricaContact {
  return { id: 1, ...overrides }
}

describe('mazrica transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 55 })).id).toBe('55')
  })

  it('splits name on first space into first_name and last_name', () => {
    const result = transformContact(makeRaw({ name: 'Taro Yamada' }))
    expect(result.first_name).toBe('Taro')
    expect(result.last_name).toBe('Yamada')
    expect(result.name).toBe('Taro Yamada')
  })

  it('sets first_name only when no space in name', () => {
    const result = transformContact(makeRaw({ name: 'Prince' }))
    expect(result.first_name).toBe('Prince')
    expect(result.last_name).toBeUndefined()
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'taro@example.com' })).email).toBe('taro@example.com')
  })

  it('maps tel to phone', () => {
    expect(transformContact(makeRaw({ tel: '+81312345678' })).phone).toBe('+81312345678')
  })

  it('maps mobileTel to mobile', () => {
    expect(transformContact(makeRaw({ mobileTel: '+819012345678' })).mobile).toBe('+819012345678')
  })

  it('maps position to title', () => {
    expect(transformContact(makeRaw({ position: 'Manager' })).title).toBe('Manager')
  })

  it('maps customer.id to company_id as string', () => {
    expect(transformContact(makeRaw({ customer: { id: 5, name: 'Acme' } })).company_id).toBe('5')
  })

  it('returns undefined company_id when customer is absent', () => {
    expect(transformContact(makeRaw()).company_id).toBeUndefined()
  })

  it('maps createdAt to IsoDatetime', () => {
    const result = transformContact(makeRaw({ createdAt: '2024-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const raw: RawMazricaContact = {
      id: 1,
      name: 'Taro Yamada',
      email: 'taro.yamada@example.com',
      tel: '+81312345678',
      mobileTel: '+819012345678',
      position: 'Director',
      customer: { id: 5, name: 'Acme Japan' },
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-02-01T14:20:00.000Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('mazrica untransformContact', () => {
  it('maps name', () => {
    expect(untransformContact({ name: 'Taro Yamada' }).name).toBe('Taro Yamada')
  })

  it('combines first_name and last_name into name when name absent', () => {
    expect(untransformContact({ first_name: 'Taro', last_name: 'Yamada' }).name).toBe('Taro Yamada')
  })

  it('maps email', () => {
    expect(untransformContact({ email: 'taro@example.com' }).email).toBe('taro@example.com')
  })

  it('maps phone to tel', () => {
    expect(untransformContact({ phone: '+81312345678' }).tel).toBe('+81312345678')
  })

  it('maps mobile to mobileTel', () => {
    expect(untransformContact({ mobile: '+819012345678' }).mobileTel).toBe('+819012345678')
  })

  it('maps title to position', () => {
    expect(untransformContact({ title: 'Manager' }).position).toBe('Manager')
  })

  it('maps company_id to numeric customerId', () => {
    expect(untransformContact({ company_id: '5' }).customerId).toBe(5)
  })
})
