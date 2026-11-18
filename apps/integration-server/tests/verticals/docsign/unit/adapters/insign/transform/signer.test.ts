import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawInsignExternUser,
  type RawInsignSignatureField,
} from '../../../../../../../src/verticals/docsign/adapters/insign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const baseUser: RawInsignExternUser = {
  externUser: 'alice@example.com',
  orderNumber: 1,
  rejected: false,
  signedAny: false,
  dsgvoDeclined: false,
  userType: 'external',
}

const baseFields: RawInsignSignatureField[] = [
  {
    fieldID: 'f1',
    role: 'signer1',
    externRole: 'alice@example.com',
    displayname: 'Alice',
    documentID: 'doc-1',
    signed: false,
    mandatory: true,
    signTimestamp: null,
  },
]

describe('insign transformSigner', () => {
  it('builds id from sessionId and externUser email', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.id).toBe('sess-1:alice@example.com')
  })

  it('maps externalId from externUser email', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.externalId).toBe('alice@example.com')
  })

  it('maps envelopeId from sessionId argument', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-42', 0)
    expect(result.envelopeId).toBe('sess-42')
  })

  it('maps email from externUser', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from matching signature field displayname', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.name).toBe('Alice')
  })

  it('sets role to signer', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.role).toBe('signer')
  })

  it('maps status to sent when field not signed and user not rejected', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.status).toBe('sent')
  })

  it('maps status to signed when signedAny=true', () => {
    const result = transformSigner({ ...baseUser, signedAny: true }, baseFields, 'sess-1', 0)
    expect(result.status).toBe('signed')
  })

  it('maps status to signed when field.signed=true', () => {
    const signedFields: RawInsignSignatureField[] = [
      { ...baseFields[0]!, signed: true, signTimestamp: 1735689600000 },
    ]
    const result = transformSigner(baseUser, signedFields, 'sess-1', 0)
    expect(result.status).toBe('signed')
  })

  it('maps status to declined when rejected=true', () => {
    const result = transformSigner(
      { ...baseUser, rejected: true, message: 'Not authorized' },
      baseFields,
      'sess-1',
      0,
    )
    expect(result.status).toBe('declined')
    expect(result.declineReason).toBe('Not authorized')
  })

  it('maps status to declined when dsgvoDeclined=true', () => {
    const result = transformSigner({ ...baseUser, dsgvoDeclined: true }, baseFields, 'sess-1', 0)
    expect(result.status).toBe('declined')
  })

  it('maps routingOrder from orderNumber when > 0', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when orderNumber is 0', () => {
    const result = transformSigner({ ...baseUser, orderNumber: 0 }, baseFields, 'sess-1', 0)
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps signedAt from field.signTimestamp when signed', () => {
    const signedFields: RawInsignSignatureField[] = [
      { ...baseFields[0]!, signed: true, signTimestamp: '2025-05-01T00:00:00.000Z' },
    ]
    const result = transformSigner(baseUser, signedFields, 'sess-1', 0)
    expect(result.signedAt).toBeDefined()
    expect(result.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('does not set signedAt when field not signed', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.signedAt).toBeUndefined()
  })

  it('sets platform to insign', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.platform).toBe('insign')
  })

  it('stores userType and signatureRole in metadata', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(result.metadata['userType']).toBe('external')
    expect(result.metadata['signatureRole']).toBe('signer1')
  })

  it('passes SignerSchema validation with valid email', () => {
    const result = transformSigner(baseUser, baseFields, 'sess-1', 0)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('passes SignerSchema validation when externUser is absent (email becomes undefined)', () => {
    const result = transformSigner({ ...baseUser, externUser: undefined }, [], 'sess-1', 0)
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to index-based id when externUser absent', () => {
    const result = transformSigner({ ...baseUser, externUser: undefined }, [], 'sess-1', 0)
    expect(result.id).toBe('sess-1:0')
    expect(result.externalId).toBe('0')
  })
})
