import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/cryptomathic-signer/transform/signer'
import type { RawCscCredentialInfo } from '../../../../../../../src/verticals/docsign/adapters/cryptomathic-signer/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('cryptomathic-signer transformSigner', () => {
  it('maps an active credential (key enabled, cert valid) to status=created', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-001',
      key: { status: 'enabled' },
      cert: {
        status: 'valid',
        subjectDN: 'CN=Jane Doe,O=Acme,C=ES',
        issuerDN: 'CN=Acme CA,O=Acme,C=ES',
        serialNumber: 'AABBCC',
      },
      auth: { mode: 'explicit', expression: 'PIN' },
      SCAL: '2',
    }
    const result = transformSigner(raw, 'cred-001')

    // id is composite: `${envelopeId}:${externalId}`
    expect(result.id).toBe('cred-001:cred-001')
    expect(result.envelopeId).toBe('cred-001')
    expect(result.externalId).toBe('cred-001')
    // name derived from CN
    expect(result.name).toBe('Jane Doe')
    // email uses serialNumber localPart on .invalid TLD
    expect(result.email).toMatch(/^AABBCC@cryptomathic-signer\.invalid$/)
    expect(result.role).toBe('signer')
    expect(result.status).toBe('created')
    expect(result.platform).toBe('cryptomathic-signer')
    // metadata
    expect(result.metadata.commonName).toBe('Jane Doe')
    expect(result.metadata.certStatus).toBe('valid')
    expect(result.metadata.authMode).toBe('explicit')
    expect(result.metadata.scal).toBe('2')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a revoked/suspended credential to status=declined', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-bad',
      key: { status: 'enabled' },
      cert: { status: 'revoked', subjectDN: 'CN=Eve,O=Acme,C=US' },
    }
    const result = transformSigner(raw, 'cred-bad')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to "Owner of <envelopeId>" when subjectDN and CN absent', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-noname',
      key: { status: 'enabled' },
      cert: { status: 'valid' },
    }
    const result = transformSigner(raw, 'cred-noname')

    // name: cn ?? subjectDN ?? `Owner of ${envelopeId}` — both DN fields absent
    expect(result.name).toBe('Owner of cred-noname')
    // email localPart falls back to envelopeId when no serialNumber
    expect(result.email).toBe('cred-noname@cryptomathic-signer.invalid')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('sanitises special characters in serialNumber for email localPart', () => {
    const raw: RawCscCredentialInfo = {
      credentialID: 'cred-san',
      key: { status: 'enabled' },
      cert: { status: 'valid', serialNumber: 'AB:CD:EF' },
    }
    const result = transformSigner(raw, 'cred-san')

    // Colons should be replaced with underscores per the replace regex
    expect(result.email).toBe('AB_CD_EF@cryptomathic-signer.invalid')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
