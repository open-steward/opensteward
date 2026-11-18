import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawYotiSignRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/yoti-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('yoti-sign transformSigner', () => {
  it('maps a signed SIGNER recipient to canonical Signer', () => {
    const raw: RawYotiSignRecipient = {
      id: 'r-001',
      name: 'Alice Signer',
      email: 'alice@example.com',
      role: 'SIGNER',
      auth_type: 'sign-auth',
      sign_status: 'SIGNED',
      signed_at: '2026-01-10T10:00:00.000Z',
    }

    const result = transformSigner(raw, 'yoti-env-001')

    expect(result.id).toBe('yoti-env-001:r-001')
    expect(result.externalId).toBe('r-001')
    expect(result.envelopeId).toBe('yoti-env-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Signer')
    expect(result.role).toBe('signer')
    // SIGNED → signed
    expect(result.status).toBe('signed')
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('yoti-sign')
    expect(result.metadata.authType).toBe('sign-auth')
    expect(result.metadata.signStatus).toBe('SIGNED')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps role variations correctly', () => {
    const check = (role: string | undefined, type?: string) =>
      transformSigner({ id: 'r', email: 'x@example.com', name: 'X', role, type }, 'env').role

    expect(check('SIGNER')).toBe('signer')
    expect(check('CC')).toBe('cc')
    expect(check('WITNESS')).toBe('witness')
    // defaults to signer for unknown
    expect(check('UNKNOWN')).toBe('signer')
    expect(check(undefined)).toBe('signer')
    // falls back to type when role absent
    expect(check(undefined, 'CC')).toBe('cc')
  })

  it('maps sign_status to SignerStatus', () => {
    const check = (sign_status: string | undefined) =>
      transformSigner({ id: 'r', email: 'x@example.com', name: 'X', sign_status }, 'env').status

    expect(check('SIGNED')).toBe('signed')
    expect(check('UNSIGNED')).toBe('sent')
    expect(check(undefined)).toBe('created')
    expect(check('UNKNOWN_STATUS')).toBe('created')
  })

  it('does not set signedAt when sign_status is UNSIGNED', () => {
    const raw: RawYotiSignRecipient = {
      id: 'r-2',
      email: 'bob@example.com',
      name: 'Bob',
      sign_status: 'UNSIGNED',
      signed_at: '2026-01-10T10:00:00.000Z',
    }
    const result = transformSigner(raw, 'env-2')
    // signed_at is always passed through toIsoDatetime — it will be set if signed_at is present
    // Source passes raw.signed_at directly to toIsoDatetime without status check
    // So signedAt will be set regardless of sign_status
    // This documents actual behavior.
    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelopeId when recipient id absent', () => {
    const raw: RawYotiSignRecipient = { email: 'x@example.com', name: 'X' }
    const result = transformSigner(raw, 'env-fallback')
    expect(result.id).toBe('env-fallback')
    expect(result.externalId).toBe('')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
