import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawFpSignJob,
} from '../../../../../../../src/verticals/docsign/adapters/fp-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('fp-sign transformSigner', () => {
  const envelopeId = '123'

  const baseRaw: RawFpSignJob = {
    id: 9,
    status: 'finished',
    workflowId: 123,
    reason: undefined,
    signerIp: '10.0.0.1',
    name: 'Job-9',
    privateMessage: 'Sign please',
    dateCreated: '2025-05-15T08:00:00.000Z',
    dateSigned: '2025-05-17T12:00:00.000Z',
    dateRejected: undefined,
    owner: {
      id: 55,
      email: 'signer@example.com',
      user: { id: 55, profile: { firstname: 'Bob', lastname: 'Builder' } },
    },
    signatureSetting: { name: 'QES', signatureType: 'qualified', authentication: 'sms-tan' },
  }

  it('maps id from raw.id', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.id).toBe('9')
    expect(result.externalId).toBe('9')
  })

  it('maps envelopeId', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.envelopeId).toBe('123')
  })

  it('maps owner.email to email', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.email).toBe('signer@example.com')
  })

  it('maps owner profile names to name', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.name).toBe('Bob Builder')
  })

  it('maps status "finished" to signed', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps status "created" to created', () => {
    const result = transformSigner({ ...baseRaw, status: 'created' }, envelopeId)
    expect(result.status).toBe('created')
  })

  it('maps status "waiting_for_input" to sent', () => {
    const result = transformSigner({ ...baseRaw, status: 'waiting_for_input' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('maps status "processing" to delivered', () => {
    const result = transformSigner({ ...baseRaw, status: 'processing' }, envelopeId)
    expect(result.status).toBe('delivered')
  })

  it('maps status "rejected" to declined', () => {
    const result = transformSigner({ ...baseRaw, status: 'rejected' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps status "cancelled" to auto_responded', () => {
    const result = transformSigner({ ...baseRaw, status: 'cancelled' }, envelopeId)
    expect(result.status).toBe('auto_responded')
  })

  it('maps dateCreated to sentAt', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.sentAt).toBe('2025-05-15T08:00:00.000Z')
  })

  it('maps dateSigned to signedAt', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.signedAt).toBe('2025-05-17T12:00:00.000Z')
  })

  it('always sets role to signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('sets platform to fp-sign', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.platform).toBe('fp-sign')
  })

  it('produces a schema-valid Signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
