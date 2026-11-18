import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawJotformForm,
} from '../../../../../src/verticals/docsign/adapters/jotform-sign/transform/envelope'
import {
  transformSigner,
  type RawJotformSubmission,
} from '../../../../../src/verticals/docsign/adapters/jotform-sign/transform/signer'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../src/verticals/docsign/adapters/jotform-sign/transform/audit-trail-entry'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../src/verticals/docsign/schema/signer'
import { AuditTrailEntrySchema } from '../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('Jotform Sign – transformEnvelope', () => {
  it('maps an ENABLED form with submissions to status=sent', () => {
    const raw: RawJotformForm = {
      id: 'form_001',
      title: 'My Sign Form',
      status: 'ENABLED',
      type: 'SIGN',
      count: '3',
      new: '1',
      created_at: '2025-01-10 08:00:00',
      updated_at: '2025-01-11 09:00:00',
      last_submission: '2025-01-11 09:00:00',
      username: 'jotformsender',
    }
    const result = transformEnvelope(raw, ['sub_1', 'sub_2'])
    expect(result.id).toBe('form_001')
    expect(result.status).toBe('sent')
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual(['sub_1', 'sub_2'])
    expect(result.documentIds).toEqual([])
    expect(result.platform).toBe('jotform-sign')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a DELETED form to status=voided', () => {
    const raw: RawJotformForm = {
      id: 'form_002',
      status: 'DELETED',
      count: '0',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('voided')
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a DISABLED form with submissions to status=completed', () => {
    const raw: RawJotformForm = {
      id: 'form_003',
      status: 'DISABLED',
      count: '5',
      new: '0',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an ENABLED form with no submissions to status=draft', () => {
    const raw: RawJotformForm = {
      id: 'form_004',
      status: 'ENABLED',
      count: '0',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an archived form to status=voided', () => {
    const raw: RawJotformForm = {
      id: 'form_005',
      status: 'ENABLED',
      archived: '1',
      count: '0',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('voided')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('Jotform Sign – transformSigner', () => {
  it('maps an ACTIVE submission to status=signed with email from answers', () => {
    const raw: RawJotformSubmission = {
      id: 'sub_001',
      form_id: 'form_001',
      status: 'ACTIVE',
      created_at: '2025-01-11 09:30:00',
      updated_at: '2025-01-11 09:30:00',
      answers: {
        '1': {
          type: 'control_fullname',
          answer: { first: 'Jane', last: 'Doe' },
        },
        '2': {
          type: 'control_email',
          answer: 'jane.doe@example.com',
        },
      },
    }
    const result = transformSigner(raw, 'form_001')
    expect(result.id).toBe('sub_001')
    expect(result.envelopeId).toBe('form_001')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.platform).toBe('jotform-sign')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a DELETED submission to status=declined', () => {
    const raw: RawJotformSubmission = {
      id: 'sub_002',
      form_id: 'form_001',
      status: 'DELETED',
    }
    const result = transformSigner(raw, 'form_001')
    expect(result.status).toBe('declined')
    expect(result.email).toBeUndefined()
    expect(result.name).toBe('')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to textbox field for name when fullname is absent', () => {
    const raw: RawJotformSubmission = {
      id: 'sub_003',
      form_id: 'form_001',
      status: 'ACTIVE',
      answers: {
        '1': {
          type: 'control_textbox',
          text: 'Full Name',
          answer: 'Bob Smith',
        },
        '2': {
          type: 'control_email',
          answer: 'bob@example.com',
        },
      },
    }
    const result = transformSigner(raw, 'form_001')
    expect(result.name).toBe('Bob Smith')
    expect(result.email).toBe('bob@example.com')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

describe('Jotform Sign – transformAuditTrailEntry', () => {
  it('maps a created event with id = envelopeId:index', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'form_001',
      occurredAt: '2025-01-10 08:00:00',
      type: 'created',
      description: 'Form created',
    }
    const result = transformAuditTrailEntry(event, 0)
    expect(result.id).toBe('form_001:0')
    expect(result.envelopeId).toBe('form_001')
    expect(result.eventType).toBe('created')
    expect(result.description).toBe('Form created')
    expect(result.platform).toBe('jotform-sign')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a signed event with actor fields', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'form_001',
      occurredAt: '2025-01-11 09:30:00',
      type: 'signed',
      signerEmail: 'jane.doe@example.com',
      signerName: 'Jane Doe',
      submissionId: 'sub_001',
      actorIp: '192.0.2.1',
      description: 'Jane Doe signed',
    }
    const result = transformAuditTrailEntry(event, 1)
    expect(result.id).toBe('form_001:1')
    expect(result.eventType).toBe('signed')
    expect(result.actorEmail).toBe('jane.doe@example.com')
    expect(result.actorName).toBe('Jane Doe')
    expect(result.actorId).toBe('sub_001')
    expect(result.actorIp).toBe('192.0.2.1')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when occurredAt is absent', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'form_001',
      type: 'completed',
      description: 'All signed',
    }
    const result = transformAuditTrailEntry(event, 2)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(result.eventType).toBe('completed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})
