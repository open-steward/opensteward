import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type TorgsoftContact } from '../../../../../../../src/verticals/accounting/adapters/torgsoft/transform/contact'

function makeContact(overrides: Partial<TorgsoftContact> = {}): TorgsoftContact {
  return {
    id: 'c-1',
    name: 'Магазин Торгсофт',
    tax_id: '99887766',
    email: 'shop@torgsoft.ua',
    phone: '+380931234567',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('c-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Магазин Торгсофт')
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('99887766')
  })

  it('maps email with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails![0].email).toBe('shop@torgsoft.ua')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.telephones![0].telephone).toBe('+380931234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('handles missing tax_id', () => {
    expect(transformContact(makeContact({ tax_id: undefined })).taxNumber).toBeUndefined()
  })

  it('handles missing email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
  })

  it('handles missing phone', () => {
    expect(transformContact(makeContact({ phone: undefined })).telephones).toBeUndefined()
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
