import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSecuredSigningSigner,
} from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('secured-signing transformSigner', () => {
  const raw: RawSecuredSigningSigner = {
    SignerReference: 'SREF-001',
    FirstName: 'Bob',
    LastName: 'Doe',
    Email: 'bob@example.com',
    MobileNumber: '+15550001234',
    MobileCountry: 'US',
    SignerType: 'Signer',
    HasSigned: true,
    SignedStatus: 'Signed',
    DeclinedReason: undefined,
    ClientReference: 'CLIENT-001',
    IDCheckStatus: 'passed',
    IDVerificationStatus: 'verified',
    IDVerificationResult: 'pass',
  }

  const envelopeId = 'REF-001'

  it('constructs id as envelopeId:SignerReference', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.id).toBe('REF-001:SREF-001')
    expect(result.externalId).toBe('SREF-001')
  })

  it('maps email from Email', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.email).toBe('bob@example.com')
  })

  it('builds name from FirstName and LastName', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.name).toBe('Bob Doe')
  })

  it('maps SignedStatus Signed → signed', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps SignedStatus Complete → signed', () => {
    const result = transformSigner({ ...raw, SignedStatus: 'Complete' }, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps SignedStatus Declined → declined', () => {
    const result = transformSigner({ ...raw, SignedStatus: 'Declined' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps SignedStatus Invitation → sent', () => {
    const result = transformSigner({ ...raw, SignedStatus: 'Invitation' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('maps SignedStatus Expired → auto_responded', () => {
    const result = transformSigner({ ...raw, SignedStatus: 'Expired' }, envelopeId)
    expect(result.status).toBe('auto_responded')
  })

  it('falls back to HasSigned:true → signed when SignedStatus is absent', () => {
    const result = transformSigner({ ...raw, SignedStatus: undefined }, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps SignerType Signer → signer role', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('maps SignerType Witness → witness role', () => {
    const result = transformSigner({ ...raw, SignerType: 'Witness' }, envelopeId)
    expect(result.role).toBe('witness')
  })

  it('maps SignerType Approver → approver role', () => {
    const result = transformSigner({ ...raw, SignerType: 'Approver' }, envelopeId)
    expect(result.role).toBe('approver')
  })

  it('maps SignerType CC → cc role', () => {
    const result = transformSigner({ ...raw, SignerType: 'CC' }, envelopeId)
    expect(result.role).toBe('cc')
  })

  it('sets platform to secured-signing', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.platform).toBe('secured-signing')
  })

  it('includes idCheckStatus in metadata', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.metadata.idCheckStatus).toBe('passed')
  })

  it('maps declineReason from DeclinedReason when present', () => {
    const result = transformSigner({ ...raw, DeclinedReason: 'Not ready to sign' }, envelopeId)
    expect(result.declineReason).toBe('Not ready to sign')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
