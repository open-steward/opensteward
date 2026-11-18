import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/signer'
import type { RawSignRequestSigner } from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const ENVELOPE_ID = 'doc-uuid-abc'

describe('signrequest transformSigner', () => {
  it('uses uuid as id', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      display_name: 'Alice Doe',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('sr-signer-alice')
    expect(result.externalId).toBe('sr-signer-alice')
  })

  it('falls back to envelopeId:email when uuid absent', () => {
    const raw: RawSignRequestSigner = { email: 'alice@example.com' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('doc-uuid-abc:alice@example.com')
  })

  it('maps envelopeId', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps email', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps display_name as name', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      display_name: 'Alice Doe',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('joins first_name and last_name when display_name absent', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Doe',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('maps notify_only to cc role', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-cc',
      email: 'cc@example.com',
      notify_only: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('cc')
  })

  it('maps approve_only to approver role', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-approver',
      email: 'approver@example.com',
      approve_only: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('approver')
  })

  it('defaults role to signer', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('signer')
  })

  it('maps declined:true to declined status', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      declined: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('declined')
  })

  it('maps signed:true to signed status', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      signed: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
  })

  it('maps viewed:true to delivered status', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      viewed: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('delivered')
  })

  it('maps emailed:true to sent status', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      emailed: true,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('sent')
  })

  it('defaults status to created when no flags set', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('created')
  })

  it('maps order to routingOrder as 1-indexed', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      order: 1,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.routingOrder).toBe(2)
  })

  it('leaves routingOrder undefined when order absent', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps signed_on to signedAt ISO', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      signed: true,
      signed_on: '2024-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.signedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('maps declined_on and declined_reason', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-bob',
      email: 'bob@example.com',
      declined: true,
      declined_on: '2024-01-20T09:00:00.000Z',
      declined_reason: 'Terms unacceptable',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.declinedAt).toBe('2024-01-20T09:00:00.000Z')
    expect(result.declineReason).toBe('Terms unacceptable')
  })

  it('sets platform to signrequest', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.platform).toBe('signrequest')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const raw: RawSignRequestSigner = {
      uuid: 'sr-signer-alice',
      email: 'alice@example.com',
      display_name: 'Alice Doe',
      order: 0,
      signed: true,
      signed_on: '2024-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
