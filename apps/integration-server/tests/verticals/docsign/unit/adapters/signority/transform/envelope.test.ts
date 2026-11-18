import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignorityDocument,
  type RawSignorityInvitation,
} from '../../../../../../../src/verticals/docsign/adapters/signority/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

// SIGNING_STATUS codes: 51=DRAFT, 52=IN_PROGRESS, 53=COMPLETED, 54=REJECTED

const invitationA: RawSignorityInvitation = {
  id: 101,
  GUID: 'guid-alice',
  recipientName: 'Alice',
  recipientEmail: 'alice@example.com',
  sequence: 1,
  status: 61,
  actionType: 15,
}

const invitationB: RawSignorityInvitation = {
  id: 102,
  GUID: 'guid-bob',
  recipientName: 'Bob',
  recipientEmail: 'bob@example.com',
  sequence: 2,
  status: 63,
  actionType: 15,
}

const rawDoc: RawSignorityDocument = {
  id: 55,
  GUID: 'doc-guid-55',
  title: 'NDA Agreement',
  senderName: 'Olivia Admin',
  senderEmail: 'olivia@company.com',
  userId: 'user-9',
  signingStatus: 52, // IN_PROGRESS → 'sent'
  documentType: 5,
  createdTime: 1705312800000, // epoch millis
  lastModifiedTime: 1708000000000,
  documentSentTime: 1705400000000,
  documentCompletedTime: undefined,
  documentRejectedTime: undefined,
  expiryTime: 1710000000000,
  invitations: [invitationA, invitationB],
  files: [{ id: 'file-1' }, { id: 'file-2' }],
  documentSetting: { message: 'Please review and sign.', subject: 'NDA' },
}

describe('signority transformEnvelope', () => {
  it('maps id from raw.id as string', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps signingStatus 52 to sent', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.status).toBe('sent')
  })

  it('maps signingStatus 51 to draft', () => {
    const result = transformEnvelope({ ...rawDoc, signingStatus: 51 })
    expect(result.status).toBe('draft')
  })

  it('maps signingStatus 53 to completed', () => {
    const result = transformEnvelope({ ...rawDoc, signingStatus: 53 })
    expect(result.status).toBe('completed')
  })

  it('maps signingStatus 54 to declined', () => {
    const result = transformEnvelope({ ...rawDoc, signingStatus: 54 })
    expect(result.status).toBe('declined')
  })

  it('maps title to subject', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.subject).toBe('NDA Agreement')
  })

  it('maps documentSetting.message to message', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.message).toBe('Please review and sign.')
  })

  it('maps senderName and senderEmail', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.senderName).toBe('Olivia Admin')
    expect(result.senderEmail).toBe('olivia@company.com')
  })

  it('maps userId to senderId', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.senderId).toBe('user-9')
  })

  it('detects sequential signing when invitations have different sequences', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing when all invitations share the same sequence', () => {
    const result = transformEnvelope({
      ...rawDoc,
      invitations: [
        { ...invitationA, sequence: 1 },
        { ...invitationB, sequence: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('orders signerIds by sequence using GUID', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signerIds).toEqual(['guid-alice', 'guid-bob'])
  })

  it('maps file ids to documentIds', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.documentIds).toEqual(['file-1', 'file-2'])
  })

  it('maps createdTime epoch millis to ISO string', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.createdAt).toBe(new Date(1705312800000).toISOString())
  })

  it('maps documentSentTime to sentAt', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.sentAt).toBe(new Date(1705400000000).toISOString())
  })

  it('leaves completedAt undefined when not completed', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.completedAt).toBeUndefined()
  })

  it('maps expiryTime to expiresAt', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.expiresAt).toBe(new Date(1710000000000).toISOString())
  })

  it('sets platform to signority', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.platform).toBe('signority')
  })

  it('puts GUID and documentType into metadata', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.metadata.GUID).toBe('doc-guid-55')
    expect(result.metadata.documentType).toBe('5')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(rawDoc)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('returns empty signerIds when no invitations', () => {
    const result = transformEnvelope({ ...rawDoc, invitations: [] })
    expect(result.signerIds).toEqual([])
  })

  it('returns empty documentIds when no files', () => {
    const result = transformEnvelope({ ...rawDoc, files: undefined })
    expect(result.documentIds).toEqual([])
  })
})
