import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawOpensignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('opensign transformEnvelope', () => {
  // OpenSign uses Parse-style dates: { __type: 'Date', iso: '...' } or plain ISO strings
  const raw: RawOpensignDocument = {
    objectId: 'doc_os_001',
    Name: 'NDA Agreement',
    Note: 'Please sign by Friday',
    IsCompleted: true,
    IsDeclined: false,
    SendinOrder: true,
    SentToOthers: true,
    SignedUrl: 'https://opensign.example/signed/doc_os_001.pdf',
    SenderName: 'Admin User',
    SenderMail: 'admin@example.com',
    TimeToCompleteDays: 7,
    ExtUserPtr: { objectId: 'usr_001', Name: 'Admin User', Email: 'admin@example.com' },
    CreatedBy: { objectId: 'usr_001' },
    Signers: [
      { objectId: 'sig_alice', Name: 'Alice', Email: 'alice@example.com', UserRole: 'signer' },
      { objectId: 'sig_bob', Name: 'Bob', Email: 'bob@example.com', UserRole: 'signer' },
    ],
    AuditTrail: [
      {
        objectId: 'at_1',
        Activity: 'Signed',
        SignedOn: { __type: 'Date', iso: '2024-01-20T14:30:00.000Z' },
        UserPtr: { objectId: 'sig_alice', Name: 'Alice', Email: 'alice@example.com' },
        ipAddress: '203.0.113.1',
      },
    ],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-20T14:30:00.000Z',
    DocSentAt: { __type: 'Date', iso: '2024-01-15T10:05:00.000Z' },
  }

  it('maps id and externalId from objectId', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('doc_os_001')
    expect(result.externalId).toBe('doc_os_001')
  })

  it('maps status to completed when IsCompleted is true', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status to declined when IsDeclined is true', () => {
    const result = transformEnvelope({ ...raw, IsCompleted: false, IsDeclined: true })
    expect(result.status).toBe('declined')
  })

  it('maps status to sent when SignedUrl is set but not completed/declined', () => {
    const result = transformEnvelope({
      ...raw,
      IsCompleted: false,
      IsDeclined: false,
      AuditTrail: [],
    })
    expect(result.status).toBe('sent')
  })

  it('maps status to delivered when AuditTrail contains signed/viewed activity', () => {
    const result = transformEnvelope({
      ...raw,
      IsCompleted: false,
      IsDeclined: false,
      AuditTrail: [{ Activity: 'Viewed' }],
    })
    expect(result.status).toBe('delivered')
  })

  it('maps status to draft when no SignedUrl and no audit activity', () => {
    const result = transformEnvelope({
      ...raw,
      IsCompleted: false,
      IsDeclined: false,
      SignedUrl: undefined,
      AuditTrail: [],
    })
    expect(result.status).toBe('draft')
  })

  it('maps subject from Name field', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('NDA Agreement')
  })

  it('maps message from Note field', () => {
    const result = transformEnvelope(raw)
    expect(result.message).toBe('Please sign by Friday')
  })

  it('maps senderEmail from SenderMail', () => {
    const result = transformEnvelope(raw)
    expect(result.senderEmail).toBe('admin@example.com')
  })

  it('maps senderName from SenderName', () => {
    const result = transformEnvelope(raw)
    expect(result.senderName).toBe('Admin User')
  })

  it('maps senderId from ExtUserPtr.objectId', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('usr_001')
  })

  it('maps SendinOrder:true → sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps SendinOrder:false → parallel', () => {
    const result = transformEnvelope({ ...raw, SendinOrder: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from Signers array objectIds', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['sig_alice', 'sig_bob'])
  })

  it('maps documentIds containing the envelope objectId', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc_os_001'])
  })

  it('maps createdAt from plain ISO string', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps sentAt from Parse Date wrapper (DocSentAt)', () => {
    const result = transformEnvelope(raw)
    expect(result.sentAt).toBe('2024-01-15T10:05:00.000Z')
  })

  it('maps completedAt from latest Signed audit entry', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('sets declinedAt when IsDeclined is true', () => {
    const result = transformEnvelope({ ...raw, IsCompleted: false, IsDeclined: true })
    expect(result.declinedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('sets platform to opensign', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('opensign')
  })

  it('includes timeToCompleteDays in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.timeToCompleteDays).toBe('7')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
