import { describe, it, expect } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/visma-sign/transform/envelope'
import { documentStatus } from '../fixtures'

describe('visma-sign transformEnvelope', () => {
  it('maps the documented "Get document status" example onto a valid Envelope', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(documentStatus()))
    expect(out).toMatchObject({
      id: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
      externalId: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
      subject: 'Test document',
      status: 'sent',
      signingOrder: 'parallel',
      signerIds: ['2076243e-351d-4b29-86ad-c2b02d7f867d'],
      documentIds: ['e59c8dc8-8848-4936-ac7c-50d9ed72085a:0'],
      platform: 'visma-sign',
      metadata: { status: 'pending' },
    })
    // Nothing undocumented is invented.
    expect(out.createdAt).toBeUndefined()
    expect(out.senderEmail).toBeUndefined()
  })

  it.each([
    ['new', 'draft'],
    ['pending', 'sent'],
    ['signed', 'completed'],
    ['cancelled', 'voided'],
    ['deleted', 'unknown'],
    ['something-else', 'unknown'],
  ])('maps document status %s to %s', (status, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope({ ...documentStatus(), status }))
    expect(out.status).toBe(expected)
  })

  it('is sequential only when an invitation requires order', () => {
    const raw = documentStatus()
    raw.invitations = [
      { uuid: 'a', order: { index: 1, require_before_sending_next_invitations: true } },
      { uuid: 'b', order: { index: 2 } },
    ]
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).signingOrder).toBe('sequential')
    raw.invitations = [
      { uuid: 'a', order: { index: 1 } },
      { uuid: 'b', order: { index: 2 } },
    ]
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).signingOrder).toBe('parallel')
  })

  it('never passes the invitation passphrase on in raw', () => {
    const out = transformEnvelope(documentStatus())
    expect(JSON.stringify(out.raw)).not.toContain('989c687b')
  })
})
