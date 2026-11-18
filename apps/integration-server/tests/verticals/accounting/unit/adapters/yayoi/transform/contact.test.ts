import { describe, it, expect } from 'vitest'
import {
  transformContactGroup,
  transformContact,
  type MisocaContactGroup,
  type MisocaContact,
} from '../../../../../../../src/verticals/accounting/adapters/yayoi/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeGroup(overrides: Partial<MisocaContactGroup> = {}): MisocaContactGroup {
  return {
    id: 42,
    recipient_name: 'Acme Corp',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

function makeContact(overrides: Partial<MisocaContact> = {}): MisocaContact {
  return {
    id: 99,
    contact_group_id: 42,
    recipient_name: 'Jane Doe',
    recipient_code: 'CODE-001',
    recipient_mail_address: 'jane@acme.example',
    recipient_tel_no: '+81-3-1234-5678',
    recipient_fax_no: '+81-3-8765-4321',
    recipient_zip_code: '100-0001',
    recipient_address1: '1-2-3 Chiyoda',
    recipient_address2: 'Building B',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformContactGroup (yayoi)', () => {
  it('maps id to string id', () => {
    expect(transformContactGroup(makeGroup()).id).toBe('42')
  })

  it('maps recipient_name to name and companyName', () => {
    const result = transformContactGroup(makeGroup())
    expect(result.name).toBe('Acme Corp')
    expect(result.companyName).toBe('Acme Corp')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformContactGroup(makeGroup())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('parses created_at and updated_at to Date', () => {
    const result = transformContactGroup(makeGroup())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt?.toISOString()).toBe('2026-02-01T14:20:00.000Z')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContactGroup(makeGroup()))).not.toThrow()
  })
})

describe('transformContact (yayoi)', () => {
  it('maps id to string id', () => {
    expect(transformContact(makeContact()).id).toBe('99')
  })

  it('maps recipient_code to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('CODE-001')
  })

  it('maps recipient_mail_address to emails[0] as WORK', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'jane@acme.example', type: 'WORK' })
  })

  it('maps recipient_tel_no to telephones WORK and recipient_fax_no to FAX', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toEqual([
      { telephone: '+81-3-1234-5678', type: 'WORK' },
      { telephone: '+81-3-8765-4321', type: 'FAX' },
    ])
  })

  it('maps recipient_address1 and recipient_zip_code to billingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('1-2-3 Chiyoda')
    expect(result.billingAddress?.postalCode).toBe('100-0001')
  })

  it('omits billingAddress when no address1 and no zip_code', () => {
    const result = transformContact(
      makeContact({ recipient_address1: undefined, recipient_zip_code: undefined }),
    )
    expect(result.billingAddress).toBeUndefined()
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })
})
