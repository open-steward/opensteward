import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DilovodContact } from '../../../../../../../src/verticals/accounting/adapters/dilovod/transform/contact'

function makeContact(overrides: Partial<DilovodContact> = {}): DilovodContact {
  return {
    id: 'c-1',
    name: 'ТОВ Ромашка',
    edrpou: '12345678',
    email: 'info@romashka.ua',
    phone: '+380441234567',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('c-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('ТОВ Ромашка')
  })

  it('maps edrpou to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12345678')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@romashka.ua')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+380441234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isActive true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('handles missing email and phone', () => {
    const result = transformContact(makeContact({ email: undefined, phone: undefined }))
    expect(result.emails).toBeUndefined()
    expect(result.telephones).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
