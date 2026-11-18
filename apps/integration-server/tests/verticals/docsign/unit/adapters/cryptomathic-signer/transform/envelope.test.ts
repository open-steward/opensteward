import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawCscCredentialInfo,
} from '../../../../../../../src/verticals/docsign/adapters/cryptomathic-signer/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('cryptomathic-signer transformEnvelope', () => {
  it('maps a valid (key enabled, cert valid) credential to status=sent', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-001',
      description: 'Production signing key',
      key: { status: 'enabled', algo: ['1.2.840.113549.1.1.11'], len: 2048 },
      cert: {
        status: 'valid',
        subjectDN: 'CN=Jane Doe,O=Acme,C=ES',
        issuerDN: 'CN=Acme CA,O=Acme,C=ES',
        serialNumber: '00AABBCC',
        validFrom: '20200101000000Z',
        validTo: '20270101000000Z',
      },
      auth: { mode: 'explicit' },
      SCAL: '1',
      multisign: 5,
      lang: 'en',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('cred-001')
    expect(result.status).toBe('sent')
    expect(result.platform).toBe('cryptomathic-signer')
    // description is preferred as the subject
    expect(result.subject).toBe('Production signing key')
    // signerIds derived from credentialID
    expect(result.signerIds).toEqual(['cred-001'])
    // documentIds is always empty for CSC credentials
    expect(result.documentIds).toEqual([])
    // signingOrder is always parallel
    expect(result.signingOrder).toBe('parallel')
    // timestamps parsed from GeneralizedTime
    expect(result.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z')
    // metadata fields
    expect(result.metadata.keyStatus).toBe('enabled')
    expect(result.metadata.certSerialNumber).toBe('00AABBCC')
    expect(result.metadata.authMode).toBe('explicit')
    expect(result.metadata.scal).toBe('1')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a revoked cert to status=voided', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-revoked',
      key: { status: 'enabled' },
      cert: { status: 'revoked', subjectDN: 'CN=Bob,O=Corp,C=US' },
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired cert to status=expired', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-exp',
      key: { status: 'enabled' },
      cert: { status: 'expired' },
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('expired')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a suspended cert to status=declined', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-sus',
      key: { status: 'enabled' },
      cert: { status: 'suspended' },
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a disabled key to status=voided regardless of cert', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-disabled',
      key: { status: 'disabled' },
      cert: { status: 'valid' },
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to subjectDN CN when description is absent', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-cn',
      cert: { status: 'valid', subjectDN: 'CN=Alice Smith,O=Corp,C=DE' },
      key: { status: 'enabled' },
    }
    const result = transformEnvelope(raw)

    expect(result.subject).toBe('Alice Smith')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to synthetic subject when no description or DN CN available', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-x',
    }
    const result = transformEnvelope(raw)

    expect(result.subject).toBe('Credential cred-x')
    expect(result.status).toBe('draft')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
