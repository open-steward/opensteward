import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/signer'
import type {
  RawViafirmaLink,
  RawViafirmaMessage,
} from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/shared'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('viafirma transformSigner', () => {
  it('maps a signed link + message to canonical Signer', () => {
    const link: RawViafirmaLink = {
      key: 'link-1',
      messageCode: 'msg-1',
      status: 'SIGNED',
      mail: 'bob@example.com',
      name: 'Bob Builder',
      order: 1,
      userCode: 'u-bob',
    }
    const message: RawViafirmaMessage = {
      code: 'msg-1',
      status: 'SIGNED',
      responseDate: 1736294400000,
    }

    const result = transformSigner(link, 'set-001', message)

    // id composed from envelopeId:externalId (messageCode)
    expect(result.id).toBe('set-001:msg-1')
    expect(result.externalId).toBe('msg-1')
    expect(result.envelopeId).toBe('set-001')
    expect(result.email).toBe('bob@example.com')
    expect(result.name).toBe('Bob Builder')
    expect(result.role).toBe('signer')
    // SIGNED → signed
    expect(result.status).toBe('signed')
    // order >= 1 → routingOrder set
    expect(result.routingOrder).toBe(1)
    // signedAt set because status is in signedStatuses
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('viafirma')
    expect(result.metadata.messageCode).toBe('msg-1')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status variations correctly', () => {
    const check = (status: string | undefined) =>
      transformSigner({ key: 'k', status }, 'env-1').status

    expect(check('RESPONSED')).toBe('signed')
    expect(check('SIGNED')).toBe('signed')
    expect(check('WAITING_CHECK')).toBe('signed')
    expect(check('REJECTED')).toBe('declined')
    expect(check('RECEIVED')).toBe('delivered')
    expect(check('OPENED')).toBe('delivered')
    expect(check('SENT')).toBe('sent')
    expect(check('PENDING')).toBe('sent')
    expect(check(undefined)).toBe('created')
  })

  it('falls back to key when messageCode absent', () => {
    const link: RawViafirmaLink = { key: 'fallback-key', mail: 'x@example.com', name: 'X' }
    const result = transformSigner(link, 'env-2')
    expect(result.externalId).toBe('fallback-key')
    expect(result.id).toBe('env-2:fallback-key')
  })

  it('does not set signedAt when status is not a signed status', () => {
    const link: RawViafirmaLink = {
      key: 'k',
      messageCode: 'msg-2',
      status: 'PENDING',
      mail: 'pending@example.com',
      name: 'Pending User',
    }
    const message: RawViafirmaMessage = { code: 'msg-2', responseDate: 1736294400000 }
    const result = transformSigner(link, 'env-3', message)
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('omits routingOrder when link order is 0', () => {
    const link: RawViafirmaLink = { key: 'k', order: 0 }
    const result = transformSigner(link, 'env-4')
    expect(result.routingOrder).toBeUndefined()
  })
})
