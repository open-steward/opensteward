import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawCertinalTransaction,
} from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const BASE: RawCertinalTransaction = {
  transactionId: 'txn-001',
  name: 'NDA Agreement',
  status: 'IN_PROGRESS',
  mail: { message: 'Please sign this NDA' },
  createdBy: { id: 'user-1', username: 'Alice Admin', emailAddress: 'alice@example.com' },
  createdDate: '2025-01-01T00:00:00.000Z',
  sentDate: '2025-01-02T00:00:00.000Z',
  lastUpdatedDate: '2025-01-03T00:00:00.000Z',
  participants: [
    { id: 'part-1', sequence: 1, role: 'SIGNER', status: 'IN_PROGRESS' },
    { id: 'part-2', sequence: 2, role: 'SIGNER', status: 'PENDING' },
  ],
  documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
}

describe('certinal/transform/envelope', () => {
  it('maps transactionId → id and platform = certinal', () => {
    const out = transformEnvelope(BASE)
    expect(out.id).toBe('txn-001')
    expect(out.platform).toBe('certinal')
  })

  it('maps IN_PROGRESS status → sent', () => {
    const out = transformEnvelope(BASE)
    expect(out.status).toBe('sent')
  })

  it('maps name → subject', () => {
    const out = transformEnvelope(BASE)
    expect(out.subject).toBe('NDA Agreement')
  })

  it('maps mail.message → message', () => {
    const out = transformEnvelope(BASE)
    expect(out.message).toBe('Please sign this NDA')
  })

  it('maps sender fields from createdBy', () => {
    const out = transformEnvelope(BASE)
    expect(out.senderId).toBe('user-1')
    expect(out.senderEmail).toBe('alice@example.com')
    expect(out.senderName).toBe('Alice Admin')
  })

  it('detects sequential signing order from distinct sequences', () => {
    const out = transformEnvelope(BASE)
    expect(out.signingOrder).toBe('sequential')
  })

  it('detects parallel signing order when all sequences are equal', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      participants: [
        { id: 'part-1', sequence: 1, role: 'SIGNER' },
        { id: 'part-2', sequence: 1, role: 'SIGNER' },
      ],
    }
    const out = transformEnvelope(raw)
    expect(out.signingOrder).toBe('parallel')
  })

  it('maps participant ids → signerIds sorted by sequence', () => {
    const out = transformEnvelope(BASE)
    expect(out.signerIds).toEqual(['part-1', 'part-2'])
  })

  it('maps document ids → documentIds', () => {
    const out = transformEnvelope(BASE)
    expect(out.documentIds).toEqual(['doc-1', 'doc-2'])
  })

  it('maps createdDate → createdAt as ISO string', () => {
    const out = transformEnvelope(BASE)
    expect(out.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('maps COMPLETED status → completed and sets completedAt from lastUpdatedDate', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      status: 'COMPLETED',
      lastUpdatedDate: '2025-02-01T00:00:00.000Z',
    }
    const out = transformEnvelope(raw)
    expect(out.status).toBe('completed')
    expect(out.completedAt).toBe('2025-02-01T00:00:00.000Z')
    expect(out.declinedAt).toBeUndefined()
    expect(out.voidedAt).toBeUndefined()
  })

  it('maps DECLINED status → declined and sets declinedAt', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      status: 'DECLINED',
      lastUpdatedDate: '2025-02-02T00:00:00.000Z',
    }
    const out = transformEnvelope(raw)
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2025-02-02T00:00:00.000Z')
  })

  it('maps VOIDED status → voided and sets voidedAt', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      status: 'VOIDED',
      lastUpdatedDate: '2025-02-03T00:00:00.000Z',
    }
    const out = transformEnvelope(raw)
    expect(out.status).toBe('voided')
    expect(out.voidedAt).toBe('2025-02-03T00:00:00.000Z')
  })

  it('maps custom fields into metadata', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      customFields: [
        { fieldName: 'department', value: 'Legal', customFieldId: 'cf-1', fieldType: 'text' },
      ],
    }
    const out = transformEnvelope(raw)
    expect(out.metadata['department']).toBe('Legal')
  })

  it('uses externalId when present', () => {
    const raw: RawCertinalTransaction = { ...BASE, externalId: 'ext-999' }
    const out = transformEnvelope(raw)
    expect(out.externalId).toBe('ext-999')
  })

  it('falls back externalId to transactionId when missing', () => {
    const out = transformEnvelope(BASE)
    expect(out.externalId).toBe('txn-001')
  })

  it('emits a schema-valid Envelope', () => {
    expect(() => EnvelopeSchema.parse(transformEnvelope(BASE))).not.toThrow()
  })

  it('emits schema-valid Envelope for completed status', () => {
    const raw: RawCertinalTransaction = {
      ...BASE,
      status: 'COMPLETED',
      lastUpdatedDate: '2025-02-01T00:00:00.000Z',
    }
    expect(() => EnvelopeSchema.parse(transformEnvelope(raw))).not.toThrow()
  })
})
