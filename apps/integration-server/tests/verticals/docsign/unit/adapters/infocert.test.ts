import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/infocert/transform/envelope'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import {
  verifyInfoCertWebhook,
  parseInfoCertWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/infocert/webhook'
import { DOSSIER_EXAMPLE } from './infocert/dossier.fixture'

describe('InfoCert transform', () => {
  it('maps a WORKED GoSign5 dossier to a completed envelope', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(DOSSIER_EXAMPLE))
    expect(out.platform).toBe('infocert')
    expect(out.status).toBe('completed')
  })
})

describe('InfoCert webhook', () => {
  it('verifies x-infocert-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyInfoCertWebhook(body, { 'x-infocert-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=infocert', () => {
    const out = parseInfoCertWebhookEvents({
      event: 'dossier.completed',
      data: { dossier: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('infocert')
  })
})
