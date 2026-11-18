import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawCongaSignRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/conga-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const BASE: RawCongaSignRecipient = {
  id: 'r-1',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Doe',
  status: 'SIGNED',
  role: 'SIGNER',
  signingOrder: 1,
  signedOn: '2025-02-01T00:00:00.000Z',
  deliveredOn: '2025-01-30T00:00:00.000Z',
  sentOn: '2025-01-29T00:00:00.000Z',
  company: 'Acme Corp',
}

describe('conga-sign/transform/signer', () => {
  it('maps id → id and externalId', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.id).toBe('r-1')
    expect(out.externalId).toBe('r-1')
  })

  it('falls back id to email when id absent', () => {
    const raw: RawCongaSignRecipient = { ...BASE, id: undefined }
    const out = transformSigner(raw, 'env-1')
    expect(out.id).toBe('alice@example.com')
  })

  it('maps envelopeId through', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps email', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.email).toBe('alice@example.com')
  })

  it('joins firstName + lastName when name absent', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.name).toBe('Alice Doe')
  })

  it('uses name field when present', () => {
    const raw: RawCongaSignRecipient = { ...BASE, name: 'Alice Full' }
    const out = transformSigner(raw, 'env-1')
    expect(out.name).toBe('Alice Full')
  })

  it('maps SIGNER role → signer', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.role).toBe('signer')
  })

  it('maps CC role → cc', () => {
    const out = transformSigner({ ...BASE, role: 'CC' }, 'env-1')
    expect(out.role).toBe('cc')
  })

  it('maps IN_PERSON role → in_person_signer', () => {
    const out = transformSigner({ ...BASE, role: 'IN_PERSON' }, 'env-1')
    expect(out.role).toBe('in_person_signer')
  })

  it('maps APPROVER role → approver', () => {
    const out = transformSigner({ ...BASE, role: 'APPROVER' }, 'env-1')
    expect(out.role).toBe('approver')
  })

  it('maps WITNESS role → witness', () => {
    const out = transformSigner({ ...BASE, role: 'WITNESS' }, 'env-1')
    expect(out.role).toBe('witness')
  })

  it('maps SIGNED status → signed', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.status).toBe('signed')
  })

  it('maps DECLINED status → declined', () => {
    const out = transformSigner({ ...BASE, status: 'DECLINED' }, 'env-1')
    expect(out.status).toBe('declined')
  })

  it('maps DELIVERED status → delivered', () => {
    const out = transformSigner({ ...BASE, status: 'DELIVERED' }, 'env-1')
    expect(out.status).toBe('delivered')
  })

  it('maps SENT status → sent', () => {
    const out = transformSigner({ ...BASE, status: 'SENT' }, 'env-1')
    expect(out.status).toBe('sent')
  })

  it('maps OPTED_OUT status → auto_responded', () => {
    const out = transformSigner({ ...BASE, status: 'OPTED_OUT' }, 'env-1')
    expect(out.status).toBe('auto_responded')
  })

  it('maps signingOrder → routingOrder', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.routingOrder).toBe(1)
  })

  it('falls back routingOrder to index field', () => {
    const raw: RawCongaSignRecipient = { ...BASE, signingOrder: undefined, index: 2 }
    const out = transformSigner(raw, 'env-1')
    expect(out.routingOrder).toBe(2)
  })

  it('maps signedOn → signedAt', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.signedAt).toBe('2025-02-01T00:00:00.000Z')
  })

  it('maps deliveredOn → deliveredAt', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.deliveredAt).toBe('2025-01-30T00:00:00.000Z')
  })

  it('maps sentOn → sentAt', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.sentAt).toBe('2025-01-29T00:00:00.000Z')
  })

  it('maps declinedOn → declinedAt and declineReason', () => {
    const raw: RawCongaSignRecipient = {
      ...BASE,
      status: 'DECLINED',
      declinedOn: '2025-02-03T00:00:00.000Z',
      declineReason: 'Needs amendment',
    }
    const out = transformSigner(raw, 'env-1')
    expect(out.declinedAt).toBe('2025-02-03T00:00:00.000Z')
    expect(out.declineReason).toBe('Needs amendment')
  })

  it('maps company into metadata', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.metadata['company']).toBe('Acme Corp')
  })

  it('maps platform = conga-sign', () => {
    const out = transformSigner(BASE, 'env-1')
    expect(out.platform).toBe('conga-sign')
  })

  it('emits a schema-valid Signer', () => {
    expect(() => SignerSchema.parse(transformSigner(BASE, 'env-1'))).not.toThrow()
  })
})
