import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawDocusealSubmission,
} from '../../../../../../../src/verticals/docsign/adapters/docuseal/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('docuseal transformEnvelope', () => {
  it('maps a completed submission with submitters and documents', () => {
    const raw: RawDocusealSubmission = {
      id: 101,
      name: 'Employment Contract',
      slug: 'empl-contract-abc',
      source: 'link',
      status: 'completed',
      submitters_order: 'random',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-10T00:00:00.000Z',
      completed_at: '2025-01-10T00:00:00.000Z',
      created_by_user: {
        id: 5,
        first_name: 'Alice',
        last_name: 'Admin',
        email: 'alice@example.com',
      },
      template: {
        id: 9,
        name: 'Employment Template',
        external_id: null,
        folder_name: 'HR',
      },
      submitters: [
        {
          id: 201,
          submission_id: 101,
          email: 'bob@example.com',
          name: 'Bob',
          status: 'completed',
          uuid: 'uuid-bob',
        },
        {
          id: 202,
          submission_id: 101,
          email: 'carol@example.com',
          name: 'Carol',
          status: 'sent',
          uuid: 'uuid-carol',
        },
      ],
      documents: [{ name: 'contract.pdf', url: 'https://example.com/contract.pdf' }],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Employment Contract')
    expect(result.senderId).toBe('5')
    expect(result.senderEmail).toBe('alice@example.com')
    expect(result.senderName).toBe('Alice Admin')
    // random submitters_order → parallel
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual(['201', '202'])
    // documentIds synthesised as `${submissionId}:${index}`
    expect(result.documentIds).toEqual(['101:0'])
    expect(result.templateId).toBe('9')
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.completedAt).toBe('2025-01-10T00:00:00.000Z')
    expect(result.platform).toBe('docuseal')
    expect(result.metadata.slug).toBe('empl-contract-abc')
    expect(result.metadata.source).toBe('link')
    expect(result.metadata.templateName).toBe('Employment Template')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending submission to status=sent', () => {
    const raw: RawDocusealSubmission = {
      id: 102,
      status: 'pending',
      created_at: '2025-02-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined submission', () => {
    const raw: RawDocusealSubmission = {
      id: 103,
      status: 'declined',
      created_at: '2025-03-01T00:00:00.000Z',
      updated_at: '2025-03-02T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired submission', () => {
    const raw: RawDocusealSubmission = {
      id: 104,
      status: 'expired',
      expire_at: '2025-01-31T00:00:00.000Z',
      created_at: '2025-01-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('expired')
    expect(result.expiresAt).toBe('2025-01-31T00:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps sequential signing when submitters_order is "preserved"', () => {
    const raw: RawDocusealSubmission = {
      id: 105,
      status: 'pending',
      submitters_order: 'preserved',
      submitters: [
        { id: 301, submission_id: 105, email: 'a@e.com', status: 'sent' },
        { id: 302, submission_id: 105, email: 'b@e.com', status: 'awaiting' },
      ],
      created_at: '2025-04-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['301', '302'])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to template name as subject when submission name absent', () => {
    const raw: RawDocusealSubmission = {
      id: 106,
      status: 'pending',
      template: { id: 10, name: 'Service Order Form' },
      created_at: '2025-05-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.subject).toBe('Service Order Form')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
