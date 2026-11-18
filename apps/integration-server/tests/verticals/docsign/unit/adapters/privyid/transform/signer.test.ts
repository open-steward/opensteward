import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawPrivyRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/privyid/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('privyid transformSigner', () => {
  const raw: RawPrivyRecipient = {
    privyId: 'PVY-001',
    email: 'bob@example.com',
    name: 'Bob Signer',
    type: 'Signer',
    status: 'Completed',
    signed: true,
    sequence: 1,
    signingDate: '2026-01-15T12:00:00.000Z',
  }

  const envelopeId = 'DOC-ABC123'

  it('constructs id as envelopeId:externalId', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.id).toBe('DOC-ABC123:PVY-001')
    expect(result.externalId).toBe('PVY-001')
  })

  it('maps email and name', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.email).toBe('bob@example.com')
    expect(result.name).toBe('Bob Signer')
  })

  it('maps signed:true → signed status (bool takes precedence)', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps type Reviewer → approver role', () => {
    const result = transformSigner({ ...raw, type: 'Reviewer' }, envelopeId)
    expect(result.role).toBe('approver')
  })

  it('maps type Signer → signer role', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('maps type cc → cc role', () => {
    const result = transformSigner({ ...raw, type: 'cc' }, envelopeId)
    expect(result.role).toBe('cc')
  })

  it('maps status rejected → declined', () => {
    const result = transformSigner({ ...raw, signed: false, status: 'rejected' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps status In Progress → sent', () => {
    const result = transformSigner({ ...raw, signed: false, status: 'In Progress' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('maps routingOrder from sequence', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.routingOrder).toBe(1)
  })

  it('maps signedAt from signingDate', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.signedAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('sets platform to privyid', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.platform).toBe('privyid')
  })

  it('falls back to email as externalId when privyId is absent', () => {
    const result = transformSigner({ ...raw, privyId: undefined }, envelopeId)
    expect(result.externalId).toBe('bob@example.com')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
