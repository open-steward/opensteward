import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  packageRecipients,
  type RawCongaSignPackage,
} from '../../../../../../../src/verticals/docsign/adapters/conga-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const BASE: RawCongaSignPackage = {
  packageId: 'pkg-001',
  packageStatus: 'SENT',
  name: 'MSA Package',
  description: 'Please review',
  senderEmail: 'admin@example.com',
  sender: { id: 'sender-1', email: 'admin@example.com', firstName: 'Admin', lastName: 'User' },
  packageRecipients: [
    { id: 'r-1', email: 'alice@example.com', signingOrder: 1 },
    { id: 'r-2', email: 'bob@example.com', signingOrder: 2 },
  ],
  documents: [{ id: 'doc-1', name: 'contract.pdf' }],
  packageCreatedOn: '2025-01-01T00:00:00.000Z',
  packageCompletedOn: undefined,
  packageDueDate: '2025-06-01T00:00:00.000Z',
  packageLastUpdated: '2025-01-02T00:00:00.000Z',
}

describe('conga-sign/transform/envelope', () => {
  it('maps packageId → id and platform = conga-sign', () => {
    const out = transformEnvelope(BASE)
    expect(out.id).toBe('pkg-001')
    expect(out.platform).toBe('conga-sign')
  })

  it('falls back id to id field when packageId absent', () => {
    const out = transformEnvelope({ ...BASE, packageId: undefined, id: 'pkg-002' })
    expect(out.id).toBe('pkg-002')
  })

  it('maps packageStatus SENT → sent', () => {
    const out = transformEnvelope(BASE)
    expect(out.status).toBe('sent')
  })

  it('maps packageStatus COMPLETED → completed', () => {
    const out = transformEnvelope({ ...BASE, packageStatus: 'COMPLETED' })
    expect(out.status).toBe('completed')
  })

  it('maps packageStatus DECLINED → declined', () => {
    const out = transformEnvelope({ ...BASE, packageStatus: 'DECLINED' })
    expect(out.status).toBe('declined')
  })

  it('maps packageStatus OPTED_OUT → voided', () => {
    const out = transformEnvelope({ ...BASE, packageStatus: 'OPTED_OUT' })
    expect(out.status).toBe('voided')
  })

  it('maps packageStatus EXPIRED → expired', () => {
    const out = transformEnvelope({ ...BASE, packageStatus: 'EXPIRED' })
    expect(out.status).toBe('expired')
  })

  it('maps name → subject', () => {
    const out = transformEnvelope(BASE)
    expect(out.subject).toBe('MSA Package')
  })

  it('maps description → message', () => {
    const out = transformEnvelope(BASE)
    expect(out.message).toBe('Please review')
  })

  it('maps sender fields', () => {
    const out = transformEnvelope(BASE)
    expect(out.senderId).toBe('sender-1')
    expect(out.senderEmail).toBe('admin@example.com')
    expect(out.senderName).toBe('Admin User')
  })

  it('detects sequential order from distinct signingOrder values', () => {
    const out = transformEnvelope(BASE)
    expect(out.signingOrder).toBe('sequential')
  })

  it('detects parallel when all recipients have same order', () => {
    const raw: RawCongaSignPackage = {
      ...BASE,
      packageRecipients: [
        { id: 'r-1', signingOrder: 1 },
        { id: 'r-2', signingOrder: 1 },
      ],
    }
    const out = transformEnvelope(raw)
    expect(out.signingOrder).toBe('parallel')
  })

  it('maps recipient ids → signerIds', () => {
    const out = transformEnvelope(BASE)
    expect(out.signerIds).toEqual(['r-1', 'r-2'])
  })

  it('falls back signerIds to email when id absent', () => {
    const raw: RawCongaSignPackage = {
      ...BASE,
      packageRecipients: [{ email: 'noid@example.com', signingOrder: 1 }],
    }
    const out = transformEnvelope(raw)
    expect(out.signerIds).toEqual(['noid@example.com'])
  })

  it('maps document ids → documentIds', () => {
    const out = transformEnvelope(BASE)
    expect(out.documentIds).toEqual(['doc-1'])
  })

  it('maps packageCreatedOn → createdAt and sentAt', () => {
    const out = transformEnvelope(BASE)
    expect(out.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(out.sentAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('maps packageDueDate → expiresAt', () => {
    const out = transformEnvelope(BASE)
    expect(out.expiresAt).toBe('2025-06-01T00:00:00.000Z')
  })

  it('maps packageLastUpdated → updatedAt', () => {
    const out = transformEnvelope(BASE)
    expect(out.updatedAt).toBe('2025-01-02T00:00:00.000Z')
  })

  it('maps congaOrgId into metadata', () => {
    const out = transformEnvelope({ ...BASE, congaOrgId: 'org-123' })
    expect(out.metadata['congaOrgId']).toBe('org-123')
  })

  it('reads recipients from nested roles[].signers when packageRecipients absent', () => {
    const raw: RawCongaSignPackage = {
      ...BASE,
      packageRecipients: undefined,
      roles: [
        {
          id: 'role-1',
          type: 'SIGNER',
          index: 1,
          signers: [{ id: 'r-3', email: 'carol@example.com' }],
        },
      ],
    }
    const recipients = packageRecipients(raw)
    expect(recipients).toHaveLength(1)
    expect(recipients[0]!.id).toBe('r-3')
  })

  it('emits a schema-valid Envelope', () => {
    expect(() => EnvelopeSchema.parse(transformEnvelope(BASE))).not.toThrow()
  })
})
