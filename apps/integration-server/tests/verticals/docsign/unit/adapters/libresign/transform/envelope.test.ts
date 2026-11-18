import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLibreSignFile,
} from '../../../../../../../src/verticals/docsign/adapters/libresign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('libresign transformEnvelope', () => {
  const raw: RawLibreSignFile = {
    uuid: 'file-uuid-001',
    name: 'Vendor Agreement',
    // FILE_STATUS.ABLE_TO_SIGN = 1
    status: 1,
    signatureFlow: 'ordered_numeric',
    created_at: '2025-06-01T10:00:00.000Z',
    requested_by: { userId: 'admin_user', displayName: 'Admin User' },
    signers: [
      { signRequestId: 101, email: 'alice@example.com', status: 0 },
      { signRequestId: 102, email: 'bob@example.com', status: 0 },
    ],
    totalPages: 4,
    mime: 'application/pdf',
  }

  it('maps uuid to id and externalId', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('file-uuid-001')
    expect(result.externalId).toBe('file-uuid-001')
  })

  it('maps status 1 (ABLE_TO_SIGN) to sent', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
  })

  it('maps name to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Vendor Agreement')
  })

  it('maps requested_by.userId to senderId', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('admin_user')
  })

  it('maps requested_by.displayName to senderName', () => {
    const result = transformEnvelope(raw)
    expect(result.senderName).toBe('Admin User')
  })

  it('maps ordered_numeric signatureFlow to sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps parallel signatureFlow to parallel', () => {
    const result = transformEnvelope({ ...raw, signatureFlow: 'parallel' })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from signRequestId fields', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toContain('101')
    expect(result.signerIds).toContain('102')
  })

  it('sets documentIds to [uuid]', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['file-uuid-001'])
  })

  it('maps created_at to createdAt', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2025-06-01T10:00:00.000Z')
  })

  it('sets platform to libresign', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('libresign')
  })

  it('maps status 0 (DRAFT) to draft', () => {
    const result = transformEnvelope({ ...raw, status: 0 })
    expect(result.status).toBe('draft')
  })

  it('maps status 2 (PARTIAL_SIGNED) to delivered', () => {
    const result = transformEnvelope({ ...raw, status: 2 })
    expect(result.status).toBe('delivered')
  })

  it('maps status 3 (SIGNED) to completed', () => {
    const signedRaw: RawLibreSignFile = {
      ...raw,
      status: 3,
      signers: [
        {
          signRequestId: 101,
          email: 'alice@example.com',
          status: 1,
          sign_date: '2025-06-05T12:00:00.000Z',
        },
      ],
    }
    const result = transformEnvelope(signedRaw)
    expect(result.status).toBe('completed')
    expect(result.completedAt).toBe('2025-06-05T12:00:00.000Z')
  })

  it('maps status 4 (DELETED) to voided', () => {
    const result = transformEnvelope({ ...raw, status: 4 })
    expect(result.status).toBe('voided')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('libresign transformEnvelope reads only documented fields', () => {
  it('throws when the documented, required uuid is missing instead of inventing an id', () => {
    expect(() => transformEnvelope({ id: 7, fileId: 7, name: 'x', status: 1 })).toThrow(/uuid/)
  })

  it('throws when a signer lacks the required signRequestId instead of inventing <uuid>:<email>', () => {
    expect(() =>
      transformEnvelope({
        uuid: 'u',
        name: 'x',
        status: 1,
        signers: [{ email: 'a@example.com', displayName: 'A', status: 0 }],
      }),
    ).toThrow(/signRequestId/)
  })

  it('maps an undocumented status integer to unknown, not draft', () => {
    const result = transformEnvelope({ uuid: 'u', name: 'x', status: 99 })
    expect(result.status).toBe('unknown')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
