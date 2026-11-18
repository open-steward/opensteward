import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/visma-sign/transform/signer'
import { documentStatus } from '../fixtures'

const ENVELOPE = 'e59c8dc8-8848-4936-ac7c-50d9ed72085a'

describe('visma-sign transformSigner', () => {
  it('maps the documented invitation onto a valid Signer', () => {
    const inv = documentStatus().invitations![0]!
    const out = SignerSchema.parse(transformSigner(inv, ENVELOPE))
    expect(out).toMatchObject({
      id: '2076243e-351d-4b29-86ad-c2b02d7f867d',
      externalId: '2076243e-351d-4b29-86ad-c2b02d7f867d',
      envelopeId: ENVELOPE,
      email: 'kumppanit.sign+invitee@visma.com',
      name: '',
      role: 'signer',
      status: 'sent',
      platform: 'visma-sign',
      metadata: { status: 'new' },
    })
    expect(out.routingOrder).toBeUndefined()
    expect(out.signedAt).toBeUndefined()
    expect(JSON.stringify(out.raw)).not.toContain('989c687b')
  })

  it.each([
    ['waiting-for-send', 'created'],
    ['sending', 'created'],
    ['new', 'sent'],
    ['opened', 'delivered'],
    ['signed', 'signed'],
    ['cancelled', 'unknown'],
  ])('maps invitation status %s to %s', (status, expected) => {
    const out = SignerSchema.parse(transformSigner({ uuid: 'i', status }, ENVELOPE))
    expect(out.status).toBe(expected)
  })

  it('reads the documented optional name and order.index', () => {
    const out = SignerSchema.parse(
      transformSigner({ uuid: 'i', name: 'Test Person', order: { index: 2 } }, ENVELOPE),
    )
    expect(out.name).toBe('Test Person')
    expect(out.routingOrder).toBe(2)
    expect(out.email).toBeUndefined()
  })

  it.each([0, -1, 1.5])('leaves routingOrder unset for an order.index of %s', (index) => {
    const out = SignerSchema.parse(transformSigner({ uuid: 'i', order: { index } }, ENVELOPE))
    expect(out.routingOrder).toBeUndefined()
  })
})
