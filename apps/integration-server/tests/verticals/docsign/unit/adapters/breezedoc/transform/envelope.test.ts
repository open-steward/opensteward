import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawBreezedocDocument,
} from '../../../../../../../src/verticals/docsign/adapters/breezedoc/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('breezedoc transformEnvelope', () => {
  it('maps a completed envelope where all non-owner recipients have completed_at', () => {
    const raw: RawBreezedocDocument = {
      id: 101,
      title: 'Service Agreement',
      slug: 'service-agreement-slug',
      created_at: '2026-01-10T08:00:00.000Z',
      updated_at: '2026-01-20T12:00:00.000Z',
      document_files: [
        { id: 501, document_file_pages: [{}, {}] },
        { id: 502, document_file_pages: [{}] },
      ],
      fields: [{ id: 201 }, { id: 202 }],
      recipients: [
        {
          id: 10,
          email: 'owner@company.com',
          name: 'Owner User',
          owner: true,
          party: 0,
          sent_at: '2026-01-11T09:00:00.000Z',
          completed_at: '2026-01-11T09:00:00.000Z',
        },
        {
          id: 11,
          email: 'alice@example.com',
          name: 'Alice',
          owner: false,
          party: 0,
          sent_at: '2026-01-11T09:00:00.000Z',
          completed_at: '2026-01-15T14:00:00.000Z',
        },
        {
          id: 12,
          email: 'bob@example.com',
          name: 'Bob',
          owner: false,
          party: 1,
          sent_at: '2026-01-16T10:00:00.000Z',
          completed_at: '2026-01-18T11:00:00.000Z',
        },
      ],
    }

    const result = transformEnvelope(raw)

    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    // All non-owner recipients have completed_at → 'completed'
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Service Agreement')
    expect(result.senderEmail).toBe('owner@company.com')
    expect(result.senderName).toBe('Owner User')
    // parties 0 and 1 → sequential
    expect(result.signingOrder).toBe('sequential')
    // non-owner recipients sorted by party, ids as strings
    expect(result.signerIds).toEqual(['11', '12'])
    // document ids are composite: envelopeId:fileId
    expect(result.documentIds).toEqual(['101:501', '101:502'])
    expect(result.platform).toBe('breezedoc')
    expect(result.metadata.slug).toBe('service-agreement-slug')
    expect(result.metadata.fieldCount).toBe('2')
    expect(result.metadata.fileCount).toBe('2')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status to delivered when some non-owner recipients have opened_at but not all completed', () => {
    const raw: RawBreezedocDocument = {
      id: 102,
      recipients: [
        {
          id: 20,
          owner: false,
          party: 0,
          sent_at: '2026-02-01T10:00:00.000Z',
          opened_at: '2026-02-02T10:00:00.000Z',
        },
        {
          id: 21,
          owner: false,
          party: 0,
          sent_at: '2026-02-01T10:00:00.000Z',
        },
      ],
    }

    const result = transformEnvelope(raw)
    expect(result.status).toBe('delivered')
    // same party → parallel
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual(['20', '21'])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status to sent when some non-owner recipients have sent_at but none have opened_at', () => {
    const raw: RawBreezedocDocument = {
      id: 103,
      recipients: [
        {
          id: 30,
          owner: false,
          party: 0,
          sent_at: '2026-03-01T10:00:00.000Z',
        },
      ],
    }

    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
    expect(result.sentAt).toBe('2026-03-01T10:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status to draft when no non-owner recipients exist', () => {
    const raw: RawBreezedocDocument = {
      id: 104,
      title: 'Draft Doc',
      recipients: [
        {
          id: 40,
          email: 'owner@example.com',
          owner: true,
          party: 0,
        },
      ],
    }

    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status to draft when recipients array is absent', () => {
    const raw: RawBreezedocDocument = { id: 105 }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('does not set completedAt when status is not completed', () => {
    const raw: RawBreezedocDocument = {
      id: 106,
      recipients: [
        {
          id: 50,
          owner: false,
          party: 0,
          sent_at: '2026-04-01T10:00:00.000Z',
        },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBeUndefined()
  })

  it('sets completedAt to the latest completed_at across recipients when completed', () => {
    const raw: RawBreezedocDocument = {
      id: 107,
      recipients: [
        {
          id: 60,
          owner: false,
          party: 0,
          completed_at: '2026-05-10T10:00:00.000Z',
        },
        {
          id: 61,
          owner: false,
          party: 1,
          completed_at: '2026-05-12T10:00:00.000Z',
        },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
    expect(result.completedAt).toBe('2026-05-12T10:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
