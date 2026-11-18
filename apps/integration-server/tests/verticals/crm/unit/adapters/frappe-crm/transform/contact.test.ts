import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawFrappeLead,
} from '../../../../../../../src/verticals/crm/adapters/frappe-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawFrappeLead> = {}): RawFrappeLead {
  return { name: 'CRM-LEAD-2024-00001', ...overrides }
}

describe('frappe-crm transformContact', () => {
  it('maps name doc id to string id', () => {
    expect(transformContact(makeRaw({ name: 'CRM-LEAD-0001' })).id).toBe('CRM-LEAD-0001')
  })

  it('maps first_name field', () => {
    expect(transformContact(makeRaw({ first_name: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps last_name field', () => {
    expect(transformContact(makeRaw({ last_name: 'Doe' })).last_name).toBe('Doe')
  })

  it('prefers lead_name over derived name', () => {
    const result = transformContact(
      makeRaw({ lead_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe' }),
    )
    expect(result.name).toBe('Jane Doe')
  })

  it('derives name from first_name + last_name when lead_name absent', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email field', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('prefers mobile_no over phone for phone field', () => {
    const result = transformContact(makeRaw({ mobile_no: '+14155550001', phone: '+14155550002' }))
    expect(result.phone).toBe('+14155550001')
  })

  it('falls back to phone when mobile_no absent', () => {
    expect(transformContact(makeRaw({ phone: '+14155550002' })).phone).toBe('+14155550002')
  })

  it('maps mobile_no to mobile field', () => {
    expect(transformContact(makeRaw({ mobile_no: '+14155550001' })).mobile).toBe('+14155550001')
  })

  it('maps job_title to title', () => {
    expect(transformContact(makeRaw({ job_title: 'VP Sales' })).title).toBe('VP Sales')
  })

  it('maps lead_owner to owner_id', () => {
    expect(transformContact(makeRaw({ lead_owner: 'user@example.com' })).owner_id).toBe(
      'user@example.com',
    )
  })

  it('maps status to stage', () => {
    expect(transformContact(makeRaw({ status: 'New' })).stage).toBe('New')
  })

  it('converts creation/modified timestamps to ISO', () => {
    const result = transformContact(
      makeRaw({
        creation: '2023-11-01 10:00:00.000000',
        modified: '2023-11-14 22:00:00.000000',
      }),
    )
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation with full input', () => {
    const raw: RawFrappeLead = {
      name: 'CRM-LEAD-0001',
      first_name: 'Jane',
      last_name: 'Doe',
      lead_name: 'Jane Doe',
      email: 'jane@example.com',
      mobile_no: '+14155550001',
      phone: '+14155550002',
      job_title: 'VP Sales',
      lead_owner: 'user@example.com',
      status: 'New',
      creation: '2023-11-01T10:00:00.000Z',
      modified: '2023-11-14T22:00:00.000Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('frappe-crm untransformContact', () => {
  it('maps first_name back', () => {
    expect(untransformContact({ first_name: 'Jane' }).first_name).toBe('Jane')
  })

  it('maps email back', () => {
    expect(untransformContact({ email: 'jane@example.com' }).email).toBe('jane@example.com')
  })

  it('maps mobile to mobile_no', () => {
    expect(untransformContact({ mobile: '+14155550001' }).mobile_no).toBe('+14155550001')
  })

  it('maps title back to job_title', () => {
    expect(untransformContact({ title: 'VP Sales' }).job_title).toBe('VP Sales')
  })

  it('maps owner_id back to lead_owner', () => {
    expect(untransformContact({ owner_id: 'user@example.com' }).lead_owner).toBe('user@example.com')
  })

  it('maps stage back to status', () => {
    expect(untransformContact({ stage: 'New' }).status).toBe('New')
  })

  it('omits unset fields', () => {
    const result = untransformContact({})
    expect(result).not.toHaveProperty('first_name')
    expect(result).not.toHaveProperty('email')
  })
})
