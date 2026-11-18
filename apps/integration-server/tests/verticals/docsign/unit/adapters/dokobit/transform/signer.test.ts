import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawDokobitSigner,
} from '../../../../../../../src/verticals/docsign/adapters/dokobit/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { SIGNING_STATUS_EXAMPLE } from './fixtures'

const [signed, pending, declined] = SIGNING_STATUS_EXAMPLE.signers as RawDokobitSigner[]

describe('dokobit transformSigner', () => {
  it('maps the documented signed signer onto the canonical schema', () => {
    const out = SignerSchema.parse(transformSigner(signed!, 'env-1'))
    expect(out.id).toBe('fac1c3834b37f8bebf2f3584d1b8b222a2262def')
    expect(out.externalId).toBe('fac1c3834b37f8bebf2f3584d1b8b222a2262def')
    expect(out.envelopeId).toBe('env-1')
    expect(out.email).toBe('james.smith@dokobit.com')
    expect(out.name).toBe('James Smith')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    // The documented example carries "signing_time": null.
    expect(out.signedAt).toBeUndefined()
    expect(out.metadata).toEqual({ type: 'signer', country: 'lt' })
    expect(out.platform).toBe('dokobit')
  })

  it('reads signature.signing_time when the platform sends one', () => {
    const withTime = {
      ...signed!,
      signature: { ...(signed!.signature as object), signing_time: '2024-01-11T15:47:50+02:00' },
    }
    expect(SignerSchema.parse(transformSigner(withTime, 'e')).signedAt).toBe(
      '2024-01-11T13:47:50.000Z',
    )
  })

  it('maps the documented declined signer with its decline_reason', () => {
    const out = SignerSchema.parse(transformSigner(declined!, 'env-1'))
    expect(out.status).toBe('declined')
    expect(out.declineReason).toBe('Declined by user')
  })

  it('maps a pending signer to sent', () => {
    expect(SignerSchema.parse(transformSigner(pending!, 'e')).status).toBe('sent')
  })

  it.each([
    ['signed', 'signed'],
    ['declined', 'declined'],
    ['pending', 'sent'],
    ['queued', 'created'],
    ['failed', 'unknown'],
  ])('maps documented signer status %s to %s', (status, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...pending!, status }, 'e')).status).toBe(expected)
  })

  it.each([
    ['signer', 'signer'],
    ['approver', 'approver'],
    ['receiver', 'unknown'],
    ['viewer', 'unknown'],
  ])('maps documented role %s to %s', (type, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...pending!, type }, 'e')).role).toBe(expected)
  })

  it('keeps the personal code and the certificate out of raw', () => {
    const raw = JSON.stringify(transformSigner(signed!, 'e').raw)
    expect(raw).not.toContain('11412090004')
    expect(raw).not.toContain('BEGIN CERTIFICATE')
  })

  it('throws when the documented signer token is absent', () => {
    const { token: _t, ...noToken } = pending!
    expect(() => transformSigner(noToken as RawDokobitSigner, 'e')).toThrow(/token/)
  })

  it('throws when neither first_name nor last_name is present instead of emitting an empty name', () => {
    // signers[0][name] and signers[0][surname] are optional create params.
    const noName = { ...pending!, first_name: null, last_name: null }
    expect(() => transformSigner(noName, 'e')).toThrow(/first_name or last_name/)
  })

  it('uses a lone first_name or last_name as the name', () => {
    expect(transformSigner({ ...pending!, last_name: null }, 'e').name).toBe(pending!.first_name)
    expect(transformSigner({ ...pending!, first_name: null }, 'e').name).toBe(pending!.last_name)
  })
})
