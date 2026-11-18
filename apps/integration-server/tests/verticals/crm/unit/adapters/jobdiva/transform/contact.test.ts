import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawJobdivaCandidate,
} from '../../../../../../../src/verticals/crm/adapters/jobdiva/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawJobdivaCandidate> = {}): RawJobdivaCandidate {
  return { candidateid: '1', ...overrides }
}

describe('jobdiva transformContact', () => {
  it('maps candidateid to string id (primary)', () => {
    expect(transformContact(makeRaw({ candidateid: '42' })).id).toBe('42')
  })

  it('falls back to id when candidateid absent', () => {
    expect(transformContact({ id: '7' }).id).toBe('7')
  })

  it('maps firstname and lastname', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', lastname: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds name from firstname + lastname', () => {
    expect(transformContact(makeRaw({ firstname: 'Jane', lastname: 'Doe' })).name).toBe('Jane Doe')
  })

  it('falls back to raw.name when no firstname/lastname', () => {
    expect(transformContact(makeRaw({ name: 'Jane Doe' })).name).toBe('Jane Doe')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('maps phone', () => {
    expect(transformContact(makeRaw({ phone: '+1-555-1234' })).phone).toBe('+1-555-1234')
  })

  it('maps cellphone to mobile', () => {
    expect(transformContact(makeRaw({ cellphone: '+1-555-9999' })).mobile).toBe('+1-555-9999')
  })

  it('maps jobtitle to title', () => {
    expect(transformContact(makeRaw({ jobtitle: 'Engineer' })).title).toBe('Engineer')
  })

  it('maps companyid to company_id', () => {
    expect(transformContact(makeRaw({ companyid: '5' })).company_id).toBe('5')
  })

  it('maps ownerid to owner_id', () => {
    expect(transformContact(makeRaw({ ownerid: '9' })).owner_id).toBe('9')
  })

  it('maps createdat to created_at', () => {
    expect(transformContact(makeRaw({ createdat: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces a ContactSchema-valid result', () => {
    const raw = makeRaw({
      candidateid: '1',
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      phone: '+1-555-1234',
      cellphone: '+1-555-9999',
      jobtitle: 'Engineer',
      companyid: '5',
      ownerid: '9',
      createdat: '2026-01-01T00:00:00.000Z',
      modifiedat: '2026-01-02T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('jobdiva untransformContact', () => {
  it('maps first_name to firstname', () => {
    expect(untransformContact({ first_name: 'Jane' }).firstname).toBe('Jane')
  })

  it('maps last_name to lastname', () => {
    expect(untransformContact({ last_name: 'Doe' }).lastname).toBe('Doe')
  })

  it('maps mobile to cellphone', () => {
    expect(untransformContact({ mobile: '+1-555-9999' }).cellphone).toBe('+1-555-9999')
  })

  it('maps title to jobtitle', () => {
    expect(untransformContact({ title: 'Engineer' }).jobtitle).toBe('Engineer')
  })

  it('maps company_id to companyid', () => {
    expect(untransformContact({ company_id: '5' }).companyid).toBe('5')
  })

  it('round-trips first_name, last_name, email', () => {
    const canonical = transformContact(
      makeRaw({ firstname: 'Jane', lastname: 'Doe', email: 'jane@example.com' }),
    )
    const wire = untransformContact(canonical)
    expect(wire.firstname).toBe('Jane')
    expect(wire.lastname).toBe('Doe')
    expect(wire.email).toBe('jane@example.com')
  })
})
