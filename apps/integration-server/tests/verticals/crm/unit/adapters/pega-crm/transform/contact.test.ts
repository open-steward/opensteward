import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawPegaContact,
} from '../../../../../../../src/verticals/crm/adapters/pega-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawPegaContact> = {}): RawPegaContact {
  return {
    pyID: 'CONT-42',
    FirstName: 'Jane',
    LastName: 'Doe',
    WorkEmail: 'jane.doe@acme.example',
    OfficePhone: '+14155550100',
    MobilePhone: '+14155550101',
    JobTitle: 'Head of Finance',
    AccountID: 'ACCT-7',
    pxCreateDateTime: '20260115T093000.000 GMT',
    pxUpdateDateTime: '20260120T120000.000 GMT',
    ...overrides,
  }
}

describe('pega-crm transformContact', () => {
  it('maps id from pyID', () => {
    expect(transformContact(makeRaw()).id).toBe('CONT-42')
  })

  it('falls back to pyGUID when pyID is absent', () => {
    expect(transformContact(makeRaw({ pyID: undefined, pyGUID: 'GUID-5' })).id).toBe('GUID-5')
  })

  it('maps first_name from FirstName', () => {
    expect(transformContact(makeRaw()).first_name).toBe('Jane')
  })

  it('maps last_name from LastName', () => {
    expect(transformContact(makeRaw()).last_name).toBe('Doe')
  })

  it('derives name by joining first and last when Name absent', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('uses raw Name field when present', () => {
    expect(transformContact(makeRaw({ Name: 'Janet Doe' })).name).toBe('Janet Doe')
  })

  it('maps email from WorkEmail', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('falls back to HomeEmail when WorkEmail absent', () => {
    expect(
      transformContact(makeRaw({ WorkEmail: undefined, HomeEmail: 'jane@home.example' })).email,
    ).toBe('jane@home.example')
  })

  it('maps phone from OfficePhone', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550100')
  })

  it('maps mobile from MobilePhone', () => {
    expect(transformContact(makeRaw()).mobile).toBe('+14155550101')
  })

  it('maps title from JobTitle', () => {
    expect(transformContact(makeRaw()).title).toBe('Head of Finance')
  })

  it('maps company_id from AccountID', () => {
    expect(transformContact(makeRaw()).company_id).toBe('ACCT-7')
  })

  it('parses Pega compact datetime for created_at', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact round-trips first_name', () => {
    const result = untransformContact({ first_name: 'John' })
    expect((result as { content: Record<string, unknown> }).content.FirstName).toBe('John')
  })

  it('untransformContact maps email to WorkEmail', () => {
    const result = untransformContact({ email: 'j@acme.example' })
    expect((result as { content: Record<string, unknown> }).content.WorkEmail).toBe(
      'j@acme.example',
    )
  })
})
