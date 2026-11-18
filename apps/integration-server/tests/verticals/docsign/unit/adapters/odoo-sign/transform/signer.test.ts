/** sign.request.item rows; field names from github.com/odoo/industry 19.0 / master sign_request.xml. */
import { describe, expect, it } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/odoo-sign/transform/signer'

const base = {
  id: 11,
  display_name: 'Tomas Rivera',
  partner_id: [15, 'Tomas Rivera'] as [number, string],
  role_id: [6, 'Artist'] as [number, string],
  state: 'completed',
  signer_email: 'tomas.rivera@test.com',
  signing_date: '2026-02-10 10:00:00',
}

describe('odoo-sign transformSigner', () => {
  it('maps a completed item', () => {
    const s = SignerSchema.parse(transformSigner(base, '5'))
    expect(s).toMatchObject({
      id: '11',
      externalId: '11',
      envelopeId: '5',
      email: 'tomas.rivera@test.com',
      name: 'Tomas Rivera',
      role: 'signer',
      status: 'signed',
      signedAt: '2026-02-10T10:00:00.000Z',
      platform: 'odoo-sign',
    })
    expect(s.metadata).toEqual({
      state: 'completed',
      partnerId: '15',
      roleId: '6',
      roleName: 'Artist',
    })
  })

  it('a sent item has no signature time, even with a signing_date (summer_camps demo)', () => {
    const s = SignerSchema.parse(transformSigner({ ...base, state: 'sent' }, '2'))
    expect(s.status).toBe('sent')
    expect(s.signedAt).toBeUndefined()
  })

  it('an unpublished state is unknown', () => {
    expect(SignerSchema.parse(transformSigner({ ...base, state: 'canceled' }, '2')).status).toBe(
      'unknown',
    )
  })

  it("leaves out an email the canonical schema would reject ('****@example.com' in museum demo)", () => {
    const s = SignerSchema.parse(
      transformSigner({ ...base, signer_email: '****@example.com' }, '5'),
    )
    expect(s.email).toBeUndefined()
    expect(s).not.toHaveProperty('email')
  })

  it('names the signer by display_name, then email, when there is no partner', () => {
    expect(SignerSchema.parse(transformSigner({ ...base, partner_id: false }, '5')).name).toBe(
      'Tomas Rivera',
    )
    expect(
      SignerSchema.parse(transformSigner({ ...base, partner_id: false, display_name: false }, '5'))
        .name,
    ).toBe('tomas.rivera@test.com')
  })

  it('tolerates a row with only an id', () => {
    const s = SignerSchema.parse(transformSigner({ id: 3 }, '1'))
    expect(s).toMatchObject({ id: '3', envelopeId: '1', name: '', status: 'unknown' })
    expect(s.metadata).toEqual({})
  })
})
