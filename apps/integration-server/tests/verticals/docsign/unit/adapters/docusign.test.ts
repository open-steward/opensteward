import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  transformEnvelope,
  type RawDocuSignEnvelope,
} from '../../../../../src/verticals/docsign/adapters/docusign/transform/envelope'
import {
  transformSigner,
  type RawDocuSignSigner,
} from '../../../../../src/verticals/docsign/adapters/docusign/transform/signer'
import { transformDocument } from '../../../../../src/verticals/docsign/adapters/docusign/transform/document'
import { transformAuditTrailEntry } from '../../../../../src/verticals/docsign/adapters/docusign/transform/audit-trail-entry'
import { transformTemplate } from '../../../../../src/verticals/docsign/adapters/docusign/transform/template'
import {
  verifyDocuSignWebhook,
  parseDocuSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/docusign/webhook'

describe('DocuSign transforms', () => {
  it('maps an envelope with sequential signers to canonical Envelope', () => {
    const raw: RawDocuSignEnvelope = {
      envelopeId: 'abc-123',
      status: 'sent',
      emailSubject: 'Please sign',
      emailBlurb: 'Hello',
      sender: { userId: 'u1', email: 'sender@example.com', userName: 'Sender' },
      createdDateTime: '2025-01-01T00:00:00.0000000Z',
      sentDateTime: '2025-01-02T00:00:00.0000000Z',
      recipients: {
        signers: [
          { recipientId: '1', routingOrder: '1' },
          { recipientId: '2', routingOrder: '2' },
        ],
      },
      envelopeDocuments: [{ documentId: '1' }, { documentId: '2' }],
    }
    const out = transformEnvelope(raw)
    expect(out.id).toBe('abc-123')
    expect(out.status).toBe('sent')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['1', '2'])
    expect(out.documentIds).toEqual(['1', '2'])
  })

  it('maps parallel-order envelope when signers share the same order', () => {
    const out = transformEnvelope({
      envelopeId: 'e1',
      status: 'completed',
      recipients: {
        signers: [
          { recipientId: '1', routingOrder: '1' },
          { recipientId: '2', routingOrder: '1' },
        ],
      },
    })
    expect(out.signingOrder).toBe('parallel')
    expect(out.status).toBe('completed')
  })

  it('maps a signer (signed)', () => {
    const raw: RawDocuSignSigner = {
      recipientId: '1',
      recipientIdGuid: 'guid-1',
      email: 'alice@example.com',
      name: 'Alice',
      status: 'completed',
      signedDateTime: '2025-01-03T00:00:00Z',
      routingOrder: '1',
    }
    const out = transformSigner(raw, 'env_1', 'signers')
    expect(out.id).toBe('guid-1')
    expect(out.status).toBe('signed')
    expect(out.role).toBe('signer')
    expect(out.email).toBe('alice@example.com')
  })

  it('maps a document with metadata only (no content/url field)', () => {
    const out = transformDocument(
      { documentId: '1', name: 'contract.pdf', order: '0', type: 'pdf' },
      'env_1',
    )
    expect(out.envelopeId).toBe('env_1')
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(0)
    expect((out as Record<string, unknown>)['content']).toBeUndefined()
    expect((out as Record<string, unknown>)['url']).toBeUndefined()
  })

  it('maps an audit event', () => {
    const out = transformAuditTrailEntry(
      {
        eventFields: [
          { name: 'logTime', value: '2025-01-04T12:34:56Z' },
          { name: 'action', value: 'Signed' },
          { name: 'description', value: 'Alice signed' },
          { name: 'userEmail', value: 'alice@example.com' },
        ],
      },
      'env_1',
      0,
    )
    expect(out.eventType).toBe('signed')
    expect(out.actorEmail).toBe('alice@example.com')
  })

  it('maps a template', () => {
    const out = transformTemplate({
      templateId: 'tpl_1',
      name: 'NDA',
      recipients: { signers: [{ roleName: 'Counterparty' }] },
      documents: [{ documentId: '1' }],
      created: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('tpl_1')
    expect(out.signerRoles).toEqual(['Counterparty'])
    expect(out.documentCount).toBe(1)
  })
})

describe('DocuSign webhook', () => {
  it('verifies a valid HMAC-SHA256 signature (base64) in X-DocuSign-Signature-1', () => {
    const secret = 'top-secret'
    const body = Buffer.from(JSON.stringify({ event: 'envelope-sent' }))
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    expect(verifyDocuSignWebhook(body, { 'x-docusign-signature-1': sig }, secret)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const secret = 'top-secret'
    const body = Buffer.from('{"event":"envelope-sent"}')
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    const tampered = Buffer.from('{"event":"envelope-voided"}')
    expect(verifyDocuSignWebhook(tampered, { 'x-docusign-signature-1': sig }, secret)).toBe(false)
  })

  it('parses envelope-completed → resourceType=envelopes, action=completed', () => {
    const events = parseDocuSignWebhookEvents({
      event: 'envelope-completed',
      data: { envelopeId: 'env_1' },
      generatedDateTime: '2025-01-01T00:00:00Z',
    })
    expect(events).toHaveLength(1)
    const evt = events[0]!
    expect(evt.resourceType).toBe('envelopes')
    expect(evt.action).toBe('completed')
    expect(evt.resourceId).toBe('env_1')
    expect(evt.envelopeId).toBe('env_1')
  })

  it('classifies recipient-completed as a signer signed event', () => {
    const events = parseDocuSignWebhookEvents({
      event: 'recipient-completed',
      data: { envelopeId: 'env_1', recipientId: 'r1' },
    })
    expect(events[0]!.resourceType).toBe('signers')
    expect(events[0]!.action).toBe('signed')
    expect(events[0]!.resourceId).toBe('r1')
  })
})
