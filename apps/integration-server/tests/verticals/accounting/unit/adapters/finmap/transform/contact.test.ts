import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FinmapContact } from '../../../../../../../src/verticals/accounting/adapters/finmap/transform/contact'

function makeContact(overrides: Partial<FinmapContact> = {}): FinmapContact {
  return {
    id: 'c-1',
    name: 'Петренко Іван',
    inn: '1234567890',
    email: 'ivan@example.ua',
    phone: '+380501234567',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('c-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Петренко Іван')
  })

  it('maps inn to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps email with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails![0].email).toBe('ivan@example.ua')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.telephones![0].telephone).toBe('+380501234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('handles missing inn', () => {
    expect(transformContact(makeContact({ inn: undefined })).taxNumber).toBeUndefined()
  })

  it('handles missing email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
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
