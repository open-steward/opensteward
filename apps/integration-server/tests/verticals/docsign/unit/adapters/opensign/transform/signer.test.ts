import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/signer'
import type {
  RawOpensignSigner,
  RawOpensignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('opensign transformSigner', () => {
  const doc: RawOpensignDocument = {
    objectId: 'doc_os_001',
    SendinOrder: true,
    SignedUrl: 'https://opensign.example/signed/doc_os_001.pdf',
    IsCompleted: true,
    IsDeclined: false,
    DocSentAt: { __type: 'Date', iso: '2024-01-15T10:05:00.000Z' },
    AuditTrail: [
      {
        objectId: 'at_1',
        Activity: 'Signed',
        SignedOn: { __type: 'Date', iso: '2024-01-20T14:30:00.000Z' },
        UserPtr: { objectId: 'sig_alice', Name: 'Alice', Email: 'alice@example.com' },
        ipAddress: '203.0.113.1',
      },
      {
        objectId: 'at_2',
        Activity: 'Viewed',
        ViewedOn: { __type: 'Date', iso: '2024-01-18T09:00:00.000Z' },
        UserPtr: { objectId: 'sig_alice', Name: 'Alice', Email: 'alice@example.com' },
      },
    ],
  }

  const raw: RawOpensignSigner = {
    objectId: 'sig_alice',
    Name: 'Alice Smith',
    Email: 'alice@example.com',
    Phone: '+1234567890',
    UserRole: 'signer',
  }

  it('maps id from objectId', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.id).toBe('sig_alice')
  })

  it('maps externalId from objectId', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.externalId).toBe('sig_alice')
  })

  it('maps id as envelopeId:index fallback when objectId is absent', () => {
    const result = transformSigner({ ...raw, objectId: undefined }, doc, 2)
    expect(result.id).toBe('doc_os_001:2')
  })

  it('maps envelopeId from doc.objectId', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.envelopeId).toBe('doc_os_001')
  })

  it('maps email from Email field', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from Name field', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.name).toBe('Alice Smith')
  })

  it('maps role signer from UserRole', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.role).toBe('signer')
  })

  it('maps role approver from UserRole containing approver', () => {
    const result = transformSigner({ ...raw, UserRole: 'approver' }, doc, 0)
    expect(result.role).toBe('approver')
  })

  it('maps role cc from UserRole containing viewer', () => {
    const result = transformSigner({ ...raw, UserRole: 'viewer' }, doc, 0)
    expect(result.role).toBe('cc')
  })

  it('derives status signed from AuditTrail', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.status).toBe('signed')
  })

  it('derives status delivered from AuditTrail viewed activity', () => {
    const docViewed: RawOpensignDocument = {
      ...doc,
      IsCompleted: false,
      AuditTrail: [
        {
          Activity: 'Viewed',
          ViewedOn: { __type: 'Date', iso: '2024-01-18T09:00:00.000Z' },
          UserPtr: { objectId: 'sig_alice' },
        },
      ],
    }
    const result = transformSigner(raw, docViewed, 0)
    expect(result.status).toBe('delivered')
  })

  it('derives status sent when SignedUrl present but no matching audit activity', () => {
    const docSent: RawOpensignDocument = {
      ...doc,
      IsCompleted: false,
      AuditTrail: [],
    }
    const result = transformSigner(raw, docSent, 0)
    expect(result.status).toBe('sent')
  })

  it('maps routingOrder as index+1 when SendinOrder is true', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when SendinOrder is false', () => {
    const result = transformSigner(raw, { ...doc, SendinOrder: false }, 0)
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps sentAt from doc.DocSentAt', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.sentAt).toBe('2024-01-15T10:05:00.000Z')
  })

  it('maps signedAt from matching signed audit row', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.signedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('maps deliveredAt from matching viewed audit row', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.deliveredAt).toBe('2024-01-18T09:00:00.000Z')
  })

  it('sets platform to opensign', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.platform).toBe('opensign')
  })

  it('includes phone in metadata', () => {
    const result = transformSigner(raw, doc, 0)
    expect(result.metadata.phone).toBe('+1234567890')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, doc, 0)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
