import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/adobe-acrobat-sign/transform/envelope'
import {
  transformSigner,
  type RawAdobeSignMember,
  type RawAdobeSignParticipantSet,
} from '../../../../../src/verticals/docsign/adapters/adobe-acrobat-sign/transform/signer'
import {
  verifyAdobeAcrobatSignWebhook,
  parseAdobeAcrobatSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/adobe-acrobat-sign/webhook'

describe('Adobe Acrobat Sign transforms', () => {
  it('maps a sequential agreement', () => {
    const out = transformEnvelope({
      id: 'agr_1',
      status: 'OUT_FOR_SIGNATURE',
      name: 'Contract',
      senderEmail: 'sender@example.com',
      participantSetsInfo: [
        { id: 'ps_1', role: 'SIGNER', order: 1, memberInfos: [{ id: 'm_1', email: 'a@example.com' }] },
        { id: 'ps_2', role: 'SIGNER', order: 2, memberInfos: [{ id: 'm_2', email: 'b@example.com' }] },
      ],
      fileInfos: [{ documentId: 'd_1' }],
      createdDate: '2025-01-01T00:00:00Z',
    })
    expect(out.status).toBe('sent')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toContain('ps_1:m_1')
  })

  it('maps a completed agreement', () => {
    const out = transformEnvelope({ id: 'agr_2', status: 'SIGNED', name: 'Done' })
    expect(out.status).toBe('completed')
  })

  it('maps an approver signer', () => {
    const set: RawAdobeSignParticipantSet = { id: 'ps_1', role: 'APPROVER', order: 1 }
    const member: RawAdobeSignMember = {
      id: 'm_1',
      email: 'a@example.com',
      name: 'Alice',
      status: 'COMPLETED',
    }
    const out = transformSigner(member, set, 'env_1')
    expect(out.role).toBe('approver')
    expect(out.status).toBe('signed')
  })
})

describe('Adobe Acrobat Sign webhook', () => {
  it('verifies X-AdobeSign-ClientSecret HMAC (base64)', () => {
    const secret = 'shh'
    const body = Buffer.from(JSON.stringify({ event: 'AGREEMENT_CREATED' }))
    const expected = createHmac('sha256', secret).update(body).digest('base64')
    expect(
      verifyAdobeAcrobatSignWebhook(body, { 'x-adobesign-clientsecret': expected }, secret),
    ).toBe(true)
  })

  it('parses AGREEMENT_WORKFLOW_COMPLETED', () => {
    const out = parseAdobeAcrobatSignWebhookEvents({
      event: 'AGREEMENT_WORKFLOW_COMPLETED',
      agreement: { id: 'agr_1' },
    })
    expect(out[0]!.action).toBe('completed')
    expect(out[0]!.resourceId).toBe('agr_1')
  })
})
