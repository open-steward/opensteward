import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawIroncladWorkflow,
} from '../../../../../../../src/verticals/docsign/adapters/ironclad/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const base: RawIroncladWorkflow = {
  id: 'wf-001',
  ironcladId: 'ic-0001',
  title: 'Partnership Agreement',
  template: 'tmpl-nda',
  templateName: 'NDA Template',
  step: 'Sign',
  status: 'active',
  isComplete: false,
  isCancelled: false,
  created: '2025-01-01T00:00:00.000Z',
  lastUpdated: '2025-01-10T00:00:00.000Z',
  recordIds: ['rec-1', 'rec-2'],
  creator: {
    id: 'usr-1',
    displayName: 'Olivia Admin',
    email: 'olivia@example.com',
  },
  signatures: {
    status: 'collecting',
    routing: 'sequential',
    provider: 'docusign',
    sentAt: '2025-01-02T00:00:00.000Z',
    completedAt: undefined,
    signers: [
      {
        email: 'alice@example.com',
        userId: 'u-alice',
        name: 'Alice',
        status: 'sent',
        routingOrder: 1,
      },
      {
        email: 'bob@example.com',
        userId: 'u-bob',
        name: 'Bob',
        status: 'pending',
        routingOrder: 2,
      },
    ],
  },
}

describe('ironclad transformEnvelope', () => {
  it('maps id and externalId from workflow id', () => {
    const result = transformEnvelope(base)
    expect(result.id).toBe('wf-001')
    expect(result.externalId).toBe('wf-001')
  })

  it('maps subject from title', () => {
    const result = transformEnvelope(base)
    expect(result.subject).toBe('Partnership Agreement')
  })

  it('maps senderId, senderEmail, senderName from creator', () => {
    const result = transformEnvelope(base)
    expect(result.senderId).toBe('usr-1')
    expect(result.senderEmail).toBe('olivia@example.com')
    expect(result.senderName).toBe('Olivia Admin')
  })

  it('maps isCancelled to voided', () => {
    const result = transformEnvelope({ ...base, isCancelled: true })
    expect(result.status).toBe('voided')
  })

  it('maps status=cancelled to voided', () => {
    const result = transformEnvelope({ ...base, status: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps isComplete to completed', () => {
    const result = transformEnvelope({ ...base, isComplete: true })
    expect(result.status).toBe('completed')
  })

  it('maps signatures.status=fully_signed to completed', () => {
    const result = transformEnvelope({
      ...base,
      signatures: { ...base.signatures, status: 'fully_signed' },
    })
    expect(result.status).toBe('completed')
  })

  it('maps signatures.status=declined to declined', () => {
    const result = transformEnvelope({
      ...base,
      signatures: { ...base.signatures, status: 'declined' },
    })
    expect(result.status).toBe('declined')
  })

  it('maps signatures.status=collecting to sent', () => {
    const result = transformEnvelope(base)
    expect(result.status).toBe('sent')
  })

  it('maps signatures.status=partially_signed to sent', () => {
    const result = transformEnvelope({
      ...base,
      signatures: { ...base.signatures, status: 'partially_signed' },
    })
    expect(result.status).toBe('sent')
  })

  it('maps active status with sentAt to sent', () => {
    const result = transformEnvelope({
      ...base,
      signatures: { sentAt: '2025-01-02T00:00:00.000Z' },
      status: 'active',
    })
    expect(result.status).toBe('sent')
  })

  it('maps active status without sentAt to draft', () => {
    const result = transformEnvelope({
      ...base,
      signatures: {},
      status: 'active',
    })
    expect(result.status).toBe('draft')
  })

  it('detects sequential signing from signatures.routing', () => {
    const result = transformEnvelope(base)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects sequential signing from differing routingOrders', () => {
    const result = transformEnvelope({
      ...base,
      signatures: {
        ...base.signatures,
        routing: undefined,
        signers: [
          { email: 'a@example.com', routingOrder: 1 },
          { email: 'b@example.com', routingOrder: 2 },
        ],
      },
    })
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing when all signers share the same routingOrder', () => {
    const result = transformEnvelope({
      ...base,
      signatures: {
        routing: 'parallel',
        signers: [
          { email: 'a@example.com', routingOrder: 1 },
          { email: 'b@example.com', routingOrder: 1 },
        ],
      },
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('collects signerIds preferring userId over email', () => {
    const result = transformEnvelope(base)
    expect(result.signerIds).toEqual(['u-alice', 'u-bob'])
  })

  it('always sets documentIds to empty array (documents fetched separately)', () => {
    const result = transformEnvelope(base)
    expect(result.documentIds).toEqual([])
  })

  it('maps templateId from template field', () => {
    const result = transformEnvelope(base)
    expect(result.templateId).toBe('tmpl-nda')
  })

  it('maps createdAt and updatedAt to ISO strings', () => {
    const result = transformEnvelope(base)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-01-10T00:00:00.000Z')
  })

  it('maps sentAt from signatures.sentAt', () => {
    const result = transformEnvelope(base)
    expect(result.sentAt).toBe('2025-01-02T00:00:00.000Z')
  })

  it('sets platform to ironclad', () => {
    const result = transformEnvelope(base)
    expect(result.platform).toBe('ironclad')
  })

  it('stores step and templateName in metadata', () => {
    const result = transformEnvelope(base)
    expect(result.metadata['step']).toBe('Sign')
    expect(result.metadata['templateName']).toBe('NDA Template')
  })

  it('stores recordIds joined by comma in metadata', () => {
    const result = transformEnvelope(base)
    expect(result.metadata['recordIds']).toBe('rec-1,rec-2')
  })

  it('stores signatureProvider in metadata', () => {
    const result = transformEnvelope(base)
    expect(result.metadata['signatureProvider']).toBe('docusign')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(base)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input with only id', () => {
    const result = transformEnvelope({ id: 'wf-min' })
    expect(result.id).toBe('wf-min')
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
