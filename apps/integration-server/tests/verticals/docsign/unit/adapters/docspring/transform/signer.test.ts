import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawDocSpringDataRequest,
} from '../../../../../../../src/verticals/docsign/adapters/docspring/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { DATA_REQUEST_EXAMPLE, DATA_REQUEST_SUBMISSION_EXAMPLE } from '../fixtures'

describe('docspring transformSigner', () => {
  it('maps the documented GET /data_requests/{id} example', () => {
    const out = SignerSchema.parse(
      transformSigner(
        DATA_REQUEST_EXAMPLE as unknown as RawDocSpringDataRequest,
        'sub_1234567890abcdef01',
      ),
    )
    expect(out.id).toBe('drq_1234567890abcdef01')
    expect(out.externalId).toBe('drq_1234567890abcdef01')
    expect(out.envelopeId).toBe('sub_1234567890abcdef01')
    expect(out.email).toBe('jdoe@example.com')
    expect(out.name).toBe('John Doe')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('created')
    expect(out.routingOrder).toBeUndefined()
    expect(out.signedAt).toBeUndefined()
    expect(out.metadata).toEqual({ order: '1', sortOrder: '0', authType: 'password' })
  })

  it('maps a data request embedded in a submission', () => {
    const drq = DATA_REQUEST_SUBMISSION_EXAMPLE
      .data_requests[0] as unknown as RawDocSpringDataRequest
    const out = SignerSchema.parse(transformSigner(drq, 'sub_1234567890abcdef01'))
    expect(out.id).toBe('drq_1234567890abcdef01')
    expect(out.name).toBe('John Smith')
    expect(out.status).toBe('created')
  })

  it('a viewed pending request is delivered', () => {
    const raw = {
      ...DATA_REQUEST_EXAMPLE,
      viewed_at: '2018-10-23T13:05:00Z',
    } as unknown as RawDocSpringDataRequest
    const out = SignerSchema.parse(transformSigner(raw, 'sub_1'))
    expect(out.status).toBe('delivered')
    expect(out.deliveredAt).toBe('2018-10-23T13:05:00.000Z')
  })

  it('a completed request is signed at completed_at', () => {
    const raw = {
      ...DATA_REQUEST_EXAMPLE,
      state: 'completed',
      completed_at: '2018-10-23T13:10:00Z',
    } as unknown as RawDocSpringDataRequest
    const out = SignerSchema.parse(transformSigner(raw, 'sub_1'))
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2018-10-23T13:10:00.000Z')
  })

  it('throws on a null id rather than inventing one', () => {
    const raw = { ...DATA_REQUEST_EXAMPLE, id: null } as unknown as RawDocSpringDataRequest
    expect(() => transformSigner(raw, 'sub_1')).toThrow(/data request id/)
  })
})
