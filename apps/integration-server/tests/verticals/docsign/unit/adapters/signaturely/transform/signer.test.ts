import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSignaturelySigner,
} from '../../../../../../../src/verticals/docsign/adapters/signaturely/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signaturely transformSigner', () => {
  it('maps a finished signer to status=signed with role=signer', () => {
    const raw: RawSignaturelySigner = {
      id: 's-001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      order: 1,
      isFinished: true,
      isDeclined: false,
      isPreparer: false,
      role: 'Signer',
    }
    const result = transformSigner(raw, 'env-1')

    expect(result.id).toBe('s-001')
    expect(result.envelopeId).toBe('env-1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.routingOrder).toBe(1)
    expect(result.platform).toBe('signaturely')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined signer to status=declined', () => {
    const raw: RawSignaturelySigner = {
      id: 's-002',
      email: 'bob@example.com',
      name: 'Bob',
      isDeclined: true,
      isFinished: false,
      isPreparer: false,
    }
    const result = transformSigner(raw, 'env-1')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a preparer to role=editor', () => {
    const raw: RawSignaturelySigner = {
      id: 's-003',
      email: 'editor@example.com',
      name: 'Editor',
      isPreparer: true,
      isFinished: false,
      isDeclined: false,
    }
    const result = transformSigner(raw, 'env-2')

    expect(result.role).toBe('editor')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('omits routingOrder when order is 0 (not a meaningful routing position)', () => {
    const raw: RawSignaturelySigner = {
      id: 's-004',
      email: 'person@example.com',
      name: 'Person',
      order: 0,
      isPreparer: false,
    }
    const result = transformSigner(raw, 'env-3')

    expect(result.routingOrder).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
