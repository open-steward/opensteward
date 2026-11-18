import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/webdox/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { signerExample } from '../fixtures'

describe('webdox transformSigner', () => {
  it('maps the documented step-signer example to a canonical Signer', () => {
    const raw = signerExample()
    const result = SignerSchema.parse(transformSigner(raw, '78'))

    expect(result.id).toBe('c1c86feb-f806-4897-b8e5-5360b00f5302')
    expect(result.externalId).toBe('c1c86feb-f806-4897-b8e5-5360b00f5302')
    expect(result.envelopeId).toBe('78')
    expect(result.email).toBe('sample.user@example.com')
    expect(result.name).toBe('Sample User')
    expect(result.role).toBe('signer')
    // Documented "status": "pending" is undefined in the docs (notified or
    // not?), so it is not guessed as 'sent'; the raw value stays in metadata.
    expect(result.status).toBe('unknown')
    expect(result.signedAt).toBeUndefined()
    // step_number is a workflow step index, not a signer routing order.
    expect(result.routingOrder).toBeUndefined()
    expect(result.platform).toBe('webdox')
    expect(result.metadata).toEqual({
      status: 'pending',
      stepNumber: '1',
      kind: 'external',
      countryCode: 'CHL',
      nationalIdentificationNumber: '20000000-1',
      nationalIdentificationKindId: '94bfbabc-9971-4cc8-bb6b-80c62aa2887d',
      stepParallelNumber: '0',
    })
  })

  it('reads a set signed_at as signed', () => {
    const raw = { ...signerExample(), signed_at: '2021-01-28T10:00:00.000-03:00' }
    const result = SignerSchema.parse(transformSigner(raw, '78'))
    expect(result.status).toBe('signed')
    expect(result.signedAt).toBe('2021-01-28T13:00:00.000Z')
  })

  it('omits email rather than emitting an empty string', () => {
    const raw = { ...signerExample(), email: null }
    const result = SignerSchema.parse(transformSigner(raw, '78'))
    expect(result).not.toHaveProperty('email')
  })

  it('throws on a signer with no name rather than emitting an empty string', () => {
    const raw = { ...signerExample(), name: null }
    expect(() => transformSigner(raw, '78')).toThrow(/has no name/)
  })

  it('maps a status value the docs do not show to unknown, not a guess', () => {
    const raw = { ...signerExample(), status: 'something_else' }
    expect(SignerSchema.parse(transformSigner(raw, '78')).status).toBe('unknown')
  })
})
