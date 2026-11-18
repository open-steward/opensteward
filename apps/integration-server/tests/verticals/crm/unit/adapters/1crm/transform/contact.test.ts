import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type Raw1CrmContact,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<Raw1CrmContact> = {}): Raw1CrmContact {
  return { id: 'cont-1', ...overrides }
}

describe('1crm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'cont-99' })).id).toBe('cont-99')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('computes full name from first + last', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('returns undefined name when both names absent', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps email1 to email', () => {
    const result = transformContact(makeRaw({ email1: 'jane@example.com' }))
    expect(result.email).toBe('jane@example.com')
  })

  it('maps phone_work to phone', () => {
    expect(transformContact(makeRaw({ phone_work: '+14155550101' })).phone).toBe('+14155550101')
  })

  it('maps phone_mobile to mobile', () => {
    expect(transformContact(makeRaw({ phone_mobile: '+14155550202' })).mobile).toBe('+14155550202')
  })

  it('maps primary_account_id to company_id', () => {
    expect(transformContact(makeRaw({ primary_account_id: 'acc-5' })).company_id).toBe('acc-5')
  })

  it('maps assigned_user_id to owner_id', () => {
    expect(transformContact(makeRaw({ assigned_user_id: 'u-3' })).owner_id).toBe('u-3')
  })

  it('converts timestamps to ISO', () => {
    const result = transformContact(
      makeRaw({
        date_entered: '2026-01-15T09:30:00Z',
        date_modified: '2026-02-01T14:20:00Z',
      }),
    )
    expect(result.created_at).toMatch(/2026-01-15/)
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const raw = makeRaw({
      first_name: 'Jane',
      last_name: 'Doe',
      email1: 'jane.doe@example.com',
      phone_work: '+14155550123',
      phone_mobile: '+14155550456',
      title: 'Head of Finance',
      primary_account_id: 'acc-1',
      assigned_user_id: 'u-1',
      date_entered: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-02T00:00:00Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('1crm untransformContact', () => {
  it('maps first_name and last_name back', () => {
    const result = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email back to email1', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email1).toBe('jane@example.com')
  })

  it('maps phone back to phone_work', () => {
    expect(untransformContact({ phone: '+14155550101' }).phone_work).toBe('+14155550101')
  })

  it('maps company_id back to primary_account_id', () => {
    expect(untransformContact({ company_id: 'acc-5' }).primary_account_id).toBe('acc-5')
  })

  it('round-trips name, email, phone', () => {
    const raw = makeRaw({
      first_name: 'Alice',
      last_name: 'Smith',
      email1: 'alice@example.com',
      phone_work: '+15555550001',
    })
    const canonical = transformContact(raw)
    const back = untransformContact(canonical)
    expect(back.first_name).toBe('Alice')
    expect(back.last_name).toBe('Smith')
    expect(back.email1).toBe('alice@example.com')
    expect(back.phone_work).toBe('+15555550001')
  })
})
