import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  inviteeId,
  type RawLeegalityDocument,
  type RawLeegalityInvitee,
} from '../../../../../src/verticals/docsign/adapters/leegality/transform/envelope'
import { transformSigner } from '../../../../../src/verticals/docsign/adapters/leegality/transform/signer'
import { transformDocument } from '../../../../../src/verticals/docsign/adapters/leegality/transform/document'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../src/verticals/docsign/schema/document'

describe('Leegality – transformEnvelope', () => {
  it('maps a document where all invitees have signed to status=completed', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-001',
      name: 'Loan Agreement',
      requests: [
        {
          name: 'Alice',
          email: 'alice@example.com',
          signed: true,
          signDate: '2025-01-10T12:00:00.000Z',
          active: false,
        },
        {
          name: 'Bob',
          email: 'bob@example.com',
          signed: true,
          signDate: '2025-01-10T14:00:00.000Z',
          active: false,
        },
      ],
      files: ['loan.pdf'],
    }
    const result = transformEnvelope(raw)
    expect(result.id).toBe('doc-001')
    expect(result.status).toBe('completed')
    // completedAt = latest signDate
    expect(result.completedAt).toBe('2025-01-10T14:00:00.000Z')
    expect(result.signingOrder).toBe('parallel')
    // files=[1] → documentIds=['doc-001:0']
    expect(result.documentIds).toEqual(['doc-001:0'])
    expect(result.platform).toBe('leegality')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a document where some invitees have signed to status=sent', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-002',
      name: 'Partial Agreement',
      requests: [
        { name: 'Alice', email: 'alice@example.com', signed: true, active: false },
        { name: 'Bob', email: 'bob@example.com', signed: false, active: true },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
    // No files → documentIds=[documentId]
    expect(result.documentIds).toEqual(['doc-002'])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a document with a rejected invitee to status=declined', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-003',
      name: 'Declined Agreement',
      requests: [{ name: 'Alice', email: 'alice@example.com', signed: false, rejected: true }],
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('declined')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses wire status field when present (COMPLETED)', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-004',
      name: 'Wire Status Doc',
      status: 'COMPLETED',
      requests: [],
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired document to status=expired', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-005',
      name: 'Expired Agreement',
      requests: [
        { name: 'Alice', email: 'alice@example.com', signed: false, expired: true },
        { name: 'Bob', email: 'bob@example.com', signed: false, expired: true },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('expired')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses signerIds derived from signUrl when present', () => {
    const raw: RawLeegalityDocument = {
      documentId: 'doc-006',
      requests: [
        {
          signUrl: 'https://esign.leegality.com/s/tok1',
          email: 'x@example.com',
          active: true,
        },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['https://esign.leegality.com/s/tok1'])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('Leegality – inviteeId', () => {
  it('prefers signUrl', () => {
    const inv: RawLeegalityInvitee = {
      signUrl: 'https://esign.leegality.com/s/tok1',
      email: 'x@example.com',
    }
    expect(inviteeId(inv, 'doc-1', 0)).toBe('https://esign.leegality.com/s/tok1')
  })

  it('falls back to email', () => {
    const inv: RawLeegalityInvitee = { email: 'x@example.com' }
    expect(inviteeId(inv, 'doc-1', 0)).toBe('x@example.com')
  })

  it('falls back to phone', () => {
    const inv: RawLeegalityInvitee = { phone: '+919876543210' }
    expect(inviteeId(inv, 'doc-1', 0)).toBe('+919876543210')
  })

  it('falls back to documentId:index', () => {
    const inv: RawLeegalityInvitee = {}
    expect(inviteeId(inv, 'doc-1', 2)).toBe('doc-1:2')
  })
})

describe('Leegality – transformSigner', () => {
  it('maps a signed invitee to status=signed', () => {
    const raw: RawLeegalityInvitee = {
      name: 'Alice',
      email: 'alice@example.com',
      signed: true,
      signDate: '2025-01-10T12:00:00.000Z',
      signType: 'aadhaar',
    }
    const result = transformSigner(raw, 'doc-001', 0)
    expect(result.id).toBe('alice@example.com')
    expect(result.envelopeId).toBe('doc-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.signedAt).toBe('2025-01-10T12:00:00.000Z')
    expect(result.platform).toBe('leegality')
    expect(result.metadata['signType']).toBe('aadhaar')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected invitee to status=declined', () => {
    const raw: RawLeegalityInvitee = {
      name: 'Bob',
      email: 'bob@example.com',
      signed: false,
      rejected: true,
    }
    const result = transformSigner(raw, 'doc-001', 1)
    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an active (pending) invitee to status=sent', () => {
    const raw: RawLeegalityInvitee = {
      name: 'Carol',
      email: 'carol@example.com',
      signed: false,
      active: true,
    }
    const result = transformSigner(raw, 'doc-001', 2)
    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an invitee with only phone (no email) to email=undefined', () => {
    const raw: RawLeegalityInvitee = {
      name: 'Phone Only',
      phone: '+919876543210',
    }
    const result = transformSigner(raw, 'doc-001', 3)
    // id falls back to phone
    expect(result.id).toBe('+919876543210')
    // No valid email → undefined
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

describe('Leegality – transformDocument', () => {
  it('maps a filename to a Document with position and pdf mimeType', () => {
    const result = transformDocument('agreement.pdf', 'doc-001', 0)
    expect(result.id).toBe('doc-001:0')
    expect(result.externalId).toBe('doc-001:0')
    expect(result.envelopeId).toBe('doc-001')
    expect(result.name).toBe('agreement.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('leegality')
    expect(result.metadata['fileName']).toBe('agreement.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('maps a second file at index=1', () => {
    const result = transformDocument('exhibit.pdf', 'doc-001', 1)
    expect(result.id).toBe('doc-001:1')
    expect(result.order).toBe(1)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
