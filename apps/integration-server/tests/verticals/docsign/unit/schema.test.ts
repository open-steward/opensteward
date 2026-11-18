import { describe, it, expect } from 'vitest'
import {
  EnvelopeSchema,
  SignerSchema,
  DocumentSchema,
  AuditTrailEntrySchema,
  TemplateSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/docsign/schema'

describe('docsign canonical schemas', () => {
  it('parses a minimal Envelope', () => {
    const parsed = EnvelopeSchema.parse({
      id: 'env_1',
      externalId: 'env_1',
      status: 'sent',
      subject: 'Sign this',
      signingOrder: 'parallel',
      signerIds: ['sig_1'],
      documentIds: ['doc_1'],
      platform: 'docusign',
      metadata: {},
    })
    expect(parsed.status).toBe('sent')
    expect(parsed.signerIds).toEqual(['sig_1'])
  })

  it('parses a Signer', () => {
    const parsed = SignerSchema.parse({
      id: 'sig_1',
      externalId: 'sig_1',
      envelopeId: 'env_1',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'signer',
      status: 'signed',
      platform: 'docusign',
      metadata: {},
    })
    expect(parsed.role).toBe('signer')
    expect(parsed.status).toBe('signed')
  })

  it('parses a Document — schema has no `content` / `url` / `previewUrl` field', () => {
    const parsed = DocumentSchema.parse({
      id: 'doc_1',
      externalId: 'doc_1',
      envelopeId: 'env_1',
      name: 'contract.pdf',
      order: 0,
      platform: 'docusign',
      metadata: {},
    })
    // The schema is the firewall — these fields must not exist on the parse output.
    expect((parsed as Record<string, unknown>)['content']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['url']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['previewUrl']).toBeUndefined()
  })

  it('rejects a Document with a `content` field by silently dropping it (strict shape)', () => {
    // Zod strips unknown keys by default; the test asserts the canonical
    // schema does not contain a `content` key after parse.
    const parsed = DocumentSchema.parse({
      id: 'doc_1',
      externalId: 'doc_1',
      envelopeId: 'env_1',
      name: 'evil.pdf',
      order: 0,
      platform: 'docusign',
      metadata: {},
      content: 'base64-encoded-pdf-bytes-here',
    } as unknown as Record<string, unknown>)
    expect((parsed as Record<string, unknown>)['content']).toBeUndefined()
  })

  it('parses an AuditTrailEntry', () => {
    const parsed = AuditTrailEntrySchema.parse({
      id: 'env_1:0',
      externalId: 'env_1:0',
      envelopeId: 'env_1',
      occurredAt: '2025-01-01T00:00:00.000Z',
      eventType: 'signed',
      description: 'Signed by Alice',
      platform: 'docusign',
      metadata: {},
    })
    expect(parsed.eventType).toBe('signed')
  })

  it('parses a Template', () => {
    const parsed = TemplateSchema.parse({
      id: 'tpl_1',
      externalId: 'tpl_1',
      name: 'NDA Template',
      signerRoles: ['Counterparty', 'Recipient'],
      documentCount: 1,
      platform: 'docusign',
      metadata: {},
    })
    expect(parsed.signerRoles).toHaveLength(2)
  })

  it('parses a WebhookEvent', () => {
    const parsed = WebhookEventSchema.parse({
      platform: 'docusign',
      type: 'envelope-completed',
      resourceType: 'envelopes',
      action: 'completed',
      resourceId: 'env_1',
      payload: {},
    })
    expect(parsed.action).toBe('completed')
  })
})
