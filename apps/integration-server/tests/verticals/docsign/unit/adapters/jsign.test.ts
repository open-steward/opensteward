import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawJsignEnvelope,
} from '../../../../../src/verticals/docsign/adapters/jsign/transform/envelope'
import {
  transformSigner,
  type RawJsignSigner,
} from '../../../../../src/verticals/docsign/adapters/jsign/transform/signer'
import {
  transformDocument,
  type RawJsignDocument,
} from '../../../../../src/verticals/docsign/adapters/jsign/transform/document'
import {
  transformTemplate,
  type RawJsignTemplate,
} from '../../../../../src/verticals/docsign/adapters/jsign/transform/template'
import {
  transformAuditTrailEntry,
  type RawJsignHistoryEvent,
} from '../../../../../src/verticals/docsign/adapters/jsign/transform/audit-trail-entry'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../src/verticals/docsign/schema/template'
import { AuditTrailEntrySchema } from '../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('jSign – transformEnvelope', () => {
  it('maps a sequential completed envelope', () => {
    const raw: RawJsignEnvelope = {
      id: 'env-uuid-001',
      name: 'NDA Agreement',
      description: 'Non-disclosure agreement',
      status: 'completed',
      sign_process_flow: 0,
      created_at: '2025-01-01T00:00:00.000Z',
      sent_at: '2025-01-01T01:00:00.000Z',
      completed_at: '2025-01-05T12:00:00.000Z',
      sender: { id: 'user-1', email: 'sender@example.com', name: 'Sender User' },
      recipients: {
        signers: [
          { id: 'sig-1', email: 'a@example.com', name: 'Alice', signing_order: 1 },
          { id: 'sig-2', email: 'b@example.com', name: 'Bob', signing_order: 2 },
        ],
      },
      documents: [{ id: 'doc-1', name: 'contract.pdf' }],
    }
    const result = transformEnvelope(raw)
    expect(result.id).toBe('env-uuid-001')
    expect(result.status).toBe('completed')
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['sig-1', 'sig-2'])
    expect(result.documentIds).toEqual(['doc-1'])
    expect(result.senderId).toBe('user-1')
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.platform).toBe('jsign')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a parallel draft envelope using sign_process_flow=1', () => {
    const raw: RawJsignEnvelope = {
      id: 'env-uuid-002',
      name: 'Partnership Agreement',
      status: 'draft',
      sign_process_flow: 1,
      recipients: {
        signers: [
          { id: 'sig-3', signing_order: 1 },
          { id: 'sig-4', signing_order: 1 },
        ],
      },
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined envelope with cancel_reason in metadata', () => {
    const raw: RawJsignEnvelope = {
      id: 'env-uuid-003',
      status: 'declined',
      name: 'Service Contract',
      decline_reason: 'Rejected by recipient',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('declined')
    expect(result.metadata['decline_reason']).toBe('Rejected by recipient')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired envelope', () => {
    const raw: RawJsignEnvelope = {
      id: 'env-uuid-004',
      status: 'expired',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('expired')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelope_id when id is absent', () => {
    const raw: RawJsignEnvelope = {
      envelope_id: 'env-alt-005',
      status: 'sent',
    }
    const result = transformEnvelope(raw)
    expect(result.id).toBe('env-alt-005')
    expect(result.status).toBe('sent')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('jSign – transformSigner', () => {
  it('maps a completed signer', () => {
    const raw: RawJsignSigner = {
      id: 'sig-001',
      name: 'Alice Example',
      email: 'alice@example.com',
      signing_order: 1,
      status: 'completed',
      signed_at: '2025-01-05T10:00:00.000Z',
    }
    const result = transformSigner(raw, 'env-001')
    expect(result.id).toBe('sig-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Example')
    expect(result.routingOrder).toBe(1)
    expect(result.platform).toBe('jsign')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an observer signer_title to role=cc', () => {
    const raw: RawJsignSigner = {
      id: 'sig-002',
      email: 'cc@example.com',
      name: 'CC User',
      signer_title: 'Observer',
      status: 'sent',
    }
    const result = transformSigner(raw, 'env-001')
    expect(result.role).toBe('cc')
    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined signer with declineReason', () => {
    const raw: RawJsignSigner = {
      id: 'sig-003',
      email: 'bob@example.com',
      name: 'Bob',
      status: 'declined',
      declined_at: '2025-01-03T09:00:00.000Z',
      decline_reason: 'Not authorized',
    }
    const result = transformSigner(raw, 'env-001')
    expect(result.status).toBe('declined')
    expect(result.declineReason).toBe('Not authorized')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelopeId:email as id when id is absent', () => {
    const raw: RawJsignSigner = {
      email: 'fallback@example.com',
      name: 'Fallback',
      status: 'sent',
    }
    const result = transformSigner(raw, 'env-001')
    expect(result.id).toBe('env-001:fallback@example.com')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

describe('jSign – transformDocument', () => {
  it('maps a PDF document by type', () => {
    const raw: RawJsignDocument = {
      id: 'doc-001',
      name: 'contract.pdf',
      type: 'pdf',
      size: 204800,
      pages: 10,
      document_ref_no: 1,
    }
    const result = transformDocument(raw, 'env-001')
    expect(result.id).toBe('doc-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.name).toBe('contract.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.sizeBytes).toBe(204800)
    expect(result.pageCount).toBe(10)
    expect(result.order).toBe(1)
    expect(result.platform).toBe('jsign')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('computes pageCount from an array of page objects', () => {
    const raw: RawJsignDocument = {
      id: 'doc-002',
      name: 'appendix.pdf',
      type: 'pdf',
      pages: [{}, {}, {}],
      document_ref_no: 2,
    }
    const result = transformDocument(raw, 'env-001')
    expect(result.pageCount).toBe(3)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelopeId:ref as id when id is absent', () => {
    const raw: RawJsignDocument = {
      name: 'attachment.docx',
      type: 'docx',
      document_ref_no: 1,
    }
    const result = transformDocument(raw, 'env-001')
    expect(result.id).toBe('env-001:1')
    expect(result.mimeType).toBe('docx')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

describe('jSign – transformTemplate', () => {
  it('maps a template with signers and documents', () => {
    const raw: RawJsignTemplate = {
      id: 'tpl-001',
      name: 'Standard NDA',
      description: 'Non-disclosure agreement template',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-10T00:00:00.000Z',
      categories: ['legal', 'nda'],
      recipients: {
        signers: [{ signer_title: 'Counterparty' }, { signer_title: 'Witness' }],
      },
      documents: [
        { id: 'd1', name: 'nda.pdf' },
        { id: 'd2', name: 'exhibit.pdf' },
      ],
    }
    const result = transformTemplate(raw)
    expect(result.id).toBe('tpl-001')
    expect(result.name).toBe('Standard NDA')
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
    expect(result.documentCount).toBe(2)
    expect(result.metadata['categories']).toBe('legal,nda')
    expect(result.platform).toBe('jsign')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to template_id when id is absent', () => {
    const raw: RawJsignTemplate = {
      template_id: 'tpl-alt-002',
      name: 'Fallback Template',
    }
    const result = transformTemplate(raw)
    expect(result.id).toBe('tpl-alt-002')
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

describe('jSign – transformAuditTrailEntry', () => {
  it('maps a created history event', () => {
    const raw: RawJsignHistoryEvent = {
      id: 'hist-001',
      event_type: 'envelope_created',
      description: 'Envelope was created',
      occurred_at: '2025-01-01T00:00:00.000Z',
      user_email: 'sender@example.com',
      user_name: 'Sender',
      ip_address: '198.51.100.1',
    }
    const result = transformAuditTrailEntry(raw, 'env-001', 0)
    expect(result.id).toBe('hist-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.eventType).toBe('created')
    expect(result.actorEmail).toBe('sender@example.com')
    expect(result.actorName).toBe('Sender')
    expect(result.actorIp).toBe('198.51.100.1')
    expect(result.platform).toBe('jsign')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a signed event using event_type keyword', () => {
    const raw: RawJsignHistoryEvent = {
      event_type: 'recipient_signed',
      description: 'Alice signed the envelope',
      occurred_at: '2025-01-05T12:00:00.000Z',
      user_email: 'alice@example.com',
    }
    const result = transformAuditTrailEntry(raw, 'env-001', 1)
    expect(result.id).toBe('env-001:1')
    expect(result.eventType).toBe('signed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when occurred_at is absent', () => {
    const raw: RawJsignHistoryEvent = {
      event_type: 'envelope_voided',
    }
    const result = transformAuditTrailEntry(raw, 'env-001', 2)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(result.eventType).toBe('voided')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a reminder event to auto_reminded', () => {
    // mapEventType checks for "reminder" before "sent", so the action must
    // contain "reminder" but NOT "sent" to reliably map to auto_reminded.
    const raw: RawJsignHistoryEvent = {
      action: 'reminder_dispatched',
      occurred_at: '2025-01-03T08:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-001', 3)
    expect(result.eventType).toBe('auto_reminded')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})
