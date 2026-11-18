import { describe, it, expect } from 'vitest'
import {
  slotNamesSigner,
  transformSigner,
  type RawConcordSignatureSlot,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import {
  GROUP_SIGNED_SLOT_EXAMPLE,
  GROUP_SLOT_EXAMPLE,
  OPEN_SLOT_EXAMPLE,
  ORGANIZATION_SLOT_EXAMPLE,
  SIGNED_SLOT_EXAMPLE,
  USER_SLOT_EXAMPLE,
} from './fixtures'

describe('concord transformSigner', () => {
  it('maps a signed slot from its signatory details', () => {
    const out = SignerSchema.parse(transformSigner(SIGNED_SLOT_EXAMPLE, 'agr-1'))
    expect(out.id).toBe('33')
    expect(out.externalId).toBe('33')
    expect(out.envelopeId).toBe('agr-1')
    expect(out.name).toBe('John Smith')
    expect(out.email).toBe('john.smith@acme.example')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2026-02-01T14:20:00.000Z')
    expect(out.metadata).toEqual({
      reservationType: 'USER',
      signatureType: 'DRAWN_IMAGE',
      organization: 'Acme Corp',
      job: 'Lawyer',
    })
  })

  it('never carries the signature image, font or typed signature in raw', () => {
    const raw = transformSigner(SIGNED_SLOT_EXAMPLE, 'agr-1').raw as RawConcordSignatureSlot
    expect(raw.signature?.info).not.toHaveProperty('image')
    expect(raw.signature?.info).not.toHaveProperty('font')
    expect(raw.signature?.info).not.toHaveProperty('signature')
    expect(raw.signature?.info?.name).toBe('John Smith')
    expect(JSON.stringify(raw)).not.toContain('base64')
  })

  it('names an unsigned slot by its reservation, with an unknown status', () => {
    const out = SignerSchema.parse(transformSigner(GROUP_SLOT_EXAMPLE, 'agr-1'))
    expect(out.name).toBe('Legal dept.')
    expect(out.email).toBeUndefined()
    expect(out.status).toBe('unknown')
    expect(out.signedAt).toBeUndefined()
  })

  it('a signed slot is named by its signatory, not by its reservation', () => {
    const out = SignerSchema.parse(transformSigner(GROUP_SIGNED_SLOT_EXAMPLE, 'agr-1'))
    expect(out.name).toBe('John Smith')
    expect(out.status).toBe('signed')
    expect(out.metadata['reservationType']).toBe('GROUP')
  })

  it('names an unsigned USER reservation by the user', () => {
    const out = SignerSchema.parse(transformSigner(USER_SLOT_EXAMPLE, 'agr-1'))
    expect(out.name).toBe('John Smith')
    expect(out.email).toBe('john.smith@acme.example')
    expect(out.status).toBe('unknown')
  })

  it('names an unsigned ORGANIZATION reservation by the organization', () => {
    const out = SignerSchema.parse(transformSigner(ORGANIZATION_SLOT_EXAMPLE, 'agr-1'))
    expect(out.name).toBe('Acme corp')
    expect(out.email).toBeUndefined()
  })

  it('names an EMAIL reservation by its address', () => {
    const out = SignerSchema.parse(
      transformSigner(
        { id: 36, reservation: { type: 'EMAIL', email: { email: 'guest@acme.example' } } },
        'agr-1',
      ),
    )
    expect(out.name).toBe('guest@acme.example')
    expect(out.email).toBe('guest@acme.example')
  })

  it('an open slot names no signer, and transforming it throws', () => {
    expect(slotNamesSigner(OPEN_SLOT_EXAMPLE)).toBe(false)
    expect(slotNamesSigner(GROUP_SLOT_EXAMPLE)).toBe(true)
    expect(() => transformSigner(OPEN_SLOT_EXAMPLE, 'agr-1')).toThrow(/names no signer/)
  })
})
