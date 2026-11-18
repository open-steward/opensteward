import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/emsigner/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { WORKFLOW_INFO_EXAMPLE } from './fixtures'

const [FIRST, SECOND] = WORKFLOW_INFO_EXAMPLE.Signatories!

describe('emsigner transformSigner', () => {
  it('maps a GetWorkflowInfo signatory onto a valid Signer', () => {
    const out = SignerSchema.parse(transformSigner(FIRST!, '1', 0))
    expect(out.id).toBe('1:0')
    expect(out.externalId).toBe('1:0')
    expect(out.envelopeId).toBe('1')
    expect(out.email).toBe('signer.one@example.com')
    expect(out.name).toBe('sample string 2')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('unknown')
    expect(out.signedAt).toBe('2020-06-04T00:00:00.000Z')
    expect(out.routingOrder).toBeUndefined()
    expect(out.metadata['emsignerStatus']).toBe('sample string 3')
    expect(out.metadata['workId']).toBe('8')
  })

  it('omits an EmailID that is not an email and a SignedDate that is not ISO', () => {
    const out = SignerSchema.parse(transformSigner(SECOND!, '1', 1))
    expect(out.id).toBe('1:1')
    expect(out.email).toBeUndefined()
    expect(out.signedAt).toBeUndefined()
  })
})
