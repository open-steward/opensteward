import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawLibreSignSigner,
} from '../../../../../../../src/verticals/docsign/adapters/libresign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('libresign transformSigner', () => {
  const raw: RawLibreSignSigner = {
    signRequestId: 55,
    email: 'carol@example.com',
    displayName: 'Carol Smith',
    // SIGNER_STATUS.SIGNED = 1
    status: 1,
    signingOrder: 2,
    request_sign_date: '2025-06-01T09:00:00.000Z',
    sign_date: '2025-06-03T14:00:00.000Z',
    identifyMethods: [
      { method: 'email', mandatory: 1 },
      { method: 'sms', mandatory: 0 },
    ],
  }

  it('maps signRequestId to id and externalId (coerced to string)', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps email to email', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.email).toBe('carol@example.com')
  })

  it('maps displayName to name', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.name).toBe('Carol Smith')
  })

  it('maps status 1 (SIGNED) to signed', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.status).toBe('signed')
  })

  it('maps signingOrder to routingOrder', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.routingOrder).toBe(2)
  })

  it('maps request_sign_date to sentAt', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.sentAt).toBe('2025-06-01T09:00:00.000Z')
  })

  it('maps sign_date to signedAt', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.signedAt).toBe('2025-06-03T14:00:00.000Z')
  })

  it('sets role to signer', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.role).toBe('signer')
  })

  it('sets platform to libresign', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.platform).toBe('libresign')
  })

  it('sets envelopeId to passed envelopeId', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.envelopeId).toBe('env-001')
  })

  it('maps status 0 (PENDING) to sent', () => {
    const result = transformSigner({ ...raw, status: 0 }, 'env-001')
    expect(result.status).toBe('sent')
  })

  it('maps status 2 (DECLINED) to declined', () => {
    const result = transformSigner({ ...raw, status: 2 }, 'env-001')
    expect(result.status).toBe('declined')
  })

  it('throws when the required signRequestId is absent instead of inventing an id', () => {
    const { signRequestId: _, ...rest } = raw
    expect(() => transformSigner({ ...rest, email: 'x@example.com' }, 'env-abc')).toThrow(
      /signRequestId/,
    )
  })

  it('omits email when LibreSign sends null (documented nullable), and still parses', () => {
    const result = transformSigner({ ...raw, email: null }, 'env-001')
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a status with no documented meaning (3) to unknown, not created', () => {
    const result = transformSigner({ ...raw, status: 3 }, 'env-001')
    expect(result.status).toBe('unknown')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('joins identifyMethods into comma-separated metadata string', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.metadata.identifyMethods).toBe('email,sms')
  })

  it('passes SignerSchema validation', () => {
    const result = transformSigner(raw, 'env-001')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
