import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawJuroContract,
  type RawJuroSigningSide,
  type RawJuroSignature,
  juroSignatureId,
} from '../../../../../src/verticals/docsign/adapters/juro/transform/envelope'
import {
  transformSigner,
  mapSignerStatus,
} from '../../../../../src/verticals/docsign/adapters/juro/transform/signer'
import { transformDocument } from '../../../../../src/verticals/docsign/adapters/juro/transform/document'
import {
  transformTemplate,
  type RawJuroTemplate,
} from '../../../../../src/verticals/docsign/adapters/juro/transform/template'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../src/verticals/docsign/schema/template'

describe('Juro – transformEnvelope', () => {
  it('maps a fully-signed contract to status=completed with sequential signing', () => {
    const raw: RawJuroContract = {
      id: 'contract-001',
      name: 'NDA Agreement',
      status: 'fully signed',
      createdDate: '2025-01-01T00:00:00.000Z',
      updatedDate: '2025-01-10T12:00:00.000Z',
      owner: { name: 'Alice Admin', username: 'alice' },
      template: { id: 'tpl-1', name: 'NDA Template' },
      signingSides: [
        {
          uid: 'side-us',
          name: 'Our Side',
          signatures: [{ uid: 'sig-1', email: 'alice@example.com', name: 'Alice' }],
        },
        {
          uid: 'side-them',
          name: 'Counterparty',
          signatures: [{ uid: 'sig-2', email: 'bob@example.com', name: 'Bob' }],
        },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.id).toBe('contract-001')
    expect(result.status).toBe('completed')
    // Two distinct signing sides → sequential
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['side-us:sig-1', 'side-them:sig-2'])
    // Contract IS the document
    expect(result.documentIds).toEqual(['contract-001'])
    expect(result.templateId).toBe('tpl-1')
    expect(result.senderName).toBe('Alice Admin')
    expect(result.senderId).toBe('alice')
    expect(result.platform).toBe('juro')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a draft contract to status=draft', () => {
    const raw: RawJuroContract = {
      id: 'contract-002',
      status: 'draft',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a "sent for signing" contract to status=sent', () => {
    const raw: RawJuroContract = {
      id: 'contract-003',
      status: 'sent for signing',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected contract to status=declined', () => {
    const raw: RawJuroContract = {
      id: 'contract-004',
      status: 'rejected',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('declined')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a single-side contract to signingOrder=parallel', () => {
    const raw: RawJuroContract = {
      id: 'contract-005',
      status: 'sent for signing',
      signingSides: [
        {
          uid: 'side-us',
          name: 'Our Side',
          signatures: [{ uid: 'sig-1', email: 'us@example.com', name: 'Us' }],
        },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('Juro – juroSignatureId', () => {
  it('uses side.uid:sig.uid when both present', () => {
    const side: RawJuroSigningSide = { uid: 'side-1' }
    const sig: RawJuroSignature = { uid: 'sig-1' }
    expect(juroSignatureId(side, sig)).toBe('side-1:sig-1')
  })

  it('falls back to sig.email when uid absent', () => {
    const side: RawJuroSigningSide = { uid: 'side-1' }
    const sig: RawJuroSignature = { email: 'user@example.com' }
    expect(juroSignatureId(side, sig)).toBe('side-1:user@example.com')
  })
})

describe('Juro – transformSigner', () => {
  it('maps a fully-signed signature to status=signed', () => {
    const side: RawJuroSigningSide = { uid: 'side-us', name: 'Our Side' }
    const sig: RawJuroSignature = {
      uid: 'sig-1',
      email: 'alice@example.com',
      name: 'Alice',
    }
    const result = transformSigner(side, sig, 'contract-001', 'fully signed')
    expect(result.id).toBe('side-us:sig-1')
    expect(result.envelopeId).toBe('contract-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.platform).toBe('juro')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected signature to status=declined', () => {
    const side: RawJuroSigningSide = { uid: 'side-them', name: 'Counterparty' }
    const sig: RawJuroSignature = { uid: 'sig-2', email: 'bob@example.com', name: 'Bob' }
    const result = transformSigner(side, sig, 'contract-001', 'rejected')
    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to username when email is absent', () => {
    const side: RawJuroSigningSide = { uid: 'side-us', name: 'Our Side' }
    const sig: RawJuroSignature = { uid: 'sig-3', username: 'internal_user' }
    const result = transformSigner(side, sig, 'contract-001', 'draft')
    expect(result.name).toBe('internal_user')
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

describe('Juro – mapSignerStatus', () => {
  it('maps fully signed to signed', () => {
    expect(mapSignerStatus('fully signed')).toBe('signed')
  })

  it('maps sent for signing to sent', () => {
    expect(mapSignerStatus('sent for signing')).toBe('sent')
  })

  it('maps draft to created', () => {
    expect(mapSignerStatus('draft')).toBe('created')
  })

  it('maps rejected to declined', () => {
    expect(mapSignerStatus('rejected')).toBe('declined')
  })
})

describe('Juro – transformDocument', () => {
  it('synthesizes a Document from a contract (contract IS the document)', () => {
    const raw: RawJuroContract = {
      id: 'contract-001',
      name: 'Partnership Agreement',
      status: 'fully signed',
      template: { id: 'tpl-1', name: 'Partnership Template' },
    }
    const result = transformDocument(raw, 'contract-001')
    expect(result.id).toBe('contract-001')
    expect(result.envelopeId).toBe('contract-001')
    expect(result.name).toBe('Partnership Agreement.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('juro')
    expect(result.metadata['templateName']).toBe('Partnership Template')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to "contract.pdf" when name is absent', () => {
    const raw: RawJuroContract = { id: 'contract-002' }
    const result = transformDocument(raw, 'contract-002')
    expect(result.name).toBe('contract.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

describe('Juro – transformTemplate', () => {
  it('maps a template with signing sides as signerRoles', () => {
    const raw: RawJuroTemplate = {
      id: 'tpl-001',
      name: 'Standard NDA',
      status: 'active',
      createdDate: '2025-01-01T00:00:00.000Z',
      updatedDate: '2025-01-10T00:00:00.000Z',
      signingSides: [
        { uid: 'side-a', name: 'Our Company' },
        { uid: 'side-b', name: 'Counterparty' },
      ],
      internalUrl: 'https://app.juro.com/templates/tpl-001',
    }
    const result = transformTemplate(raw)
    expect(result.id).toBe('tpl-001')
    expect(result.name).toBe('Standard NDA')
    expect(result.signerRoles).toEqual(['Our Company', 'Counterparty'])
    // Juro templates always produce exactly one document
    expect(result.documentCount).toBe(1)
    expect(result.platform).toBe('juro')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('returns empty signerRoles when no signingSides', () => {
    const raw: RawJuroTemplate = {
      id: 'tpl-002',
      name: 'Simple Agreement',
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(1)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to uid when side name is absent', () => {
    const raw: RawJuroTemplate = {
      id: 'tpl-003',
      name: 'UID Fallback Template',
      signingSides: [{ uid: 'side-uid-only' }],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['side-uid-only'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
