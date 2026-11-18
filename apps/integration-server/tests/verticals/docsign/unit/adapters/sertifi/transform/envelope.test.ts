import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSertifiFolder,
} from '../../../../../../../src/verticals/docsign/adapters/sertifi/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('sertifi transformEnvelope', () => {
  it('maps an archived folder to canonical Envelope', () => {
    const raw: RawSertifiFolder = {
      folderId: 'folder-001',
      name: 'NDA 2026',
      folderStatus: 'Archived',
      sender: {
        email: 'sender@example.com',
        firstName: 'Alice',
        lastName: 'Admin',
      },
      createdAt: '2026-01-10T09:00:00.000Z',
      expiresOn: '2026-02-10T09:00:00.000Z',
      lastActionAt: '2026-01-20T15:00:00.000Z',
      participants: [
        { userId: 'u1', email: 'bob@example.com', participantType: 'FirstSigner', signed: '1' },
        { userId: 'u2', email: 'carol@example.com', participantType: 'SecondSigner', signed: '0' },
      ],
      documents: [{ documentId: 'doc-1' }, { documentId: 'doc-2' }],
    }

    const result = transformEnvelope(raw)

    // id maps from folderId
    expect(result.id).toBe('folder-001')
    expect(result.externalId).toBe('folder-001')
    // Archived → completed
    expect(result.status).toBe('completed')
    // subject maps from name
    expect(result.subject).toBe('NDA 2026')
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.senderName).toBe('Alice Admin')
    // Two distinct signing levels → sequential
    expect(result.signingOrder).toBe('sequential')
    // signerIds sorted by level: u1 (level 1) before u2 (level 2)
    expect(result.signerIds).toEqual(['u1', 'u2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.platform).toBe('sertifi')
    expect(result.metadata.folderStatus).toBe('Archived')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps folderStatus variations to canonical status', () => {
    const check = (folderStatus: string | undefined) => transformEnvelope({ folderStatus }).status

    expect(check('Creating')).toBe('draft')
    expect(check('Active')).toBe('sent')
    expect(check('ActiveCC')).toBe('sent')
    expect(check('AwaitingVerification')).toBe('delivered')
    expect(check('Archived')).toBe('completed')
    expect(check('ArchivedCC')).toBe('completed')
    expect(check('Declined')).toBe('declined')
    expect(check('DeclinedAndArchived')).toBe('declined')
    expect(check('Deleted')).toBe('voided')
    expect(check('Expired')).toBe('expired')
    // unknown falls back to 'unknown'
    expect(check(undefined)).toBe('unknown')
    expect(check('something_else')).toBe('unknown')
  })

  it('uses parallel signing order when all participants share the same level', () => {
    const raw: RawSertifiFolder = {
      folderId: 'f2',
      participants: [
        { userId: 'u1', participantType: 'FirstSigner' },
        { userId: 'u2', participantType: 'FirstSigner' },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('falls back to email for signerIds when userId absent', () => {
    const raw: RawSertifiFolder = {
      folderId: 'f3',
      participants: [{ email: 'anon@example.com', participantType: 'FirstSigner' }],
    }
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['anon@example.com'])
  })

  it('produces empty signerIds and documentIds when arrays absent', () => {
    const result = transformEnvelope({ folderId: 'f4' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
