import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/document'
import type { RawViafirmaMessage } from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/shared'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('viafirma transformDocument', () => {
  it('maps a Viafirma message to canonical Document', () => {
    const raw: RawViafirmaMessage = {
      code: 'msg-1',
      title: 'Contract.pdf',
      status: 'RESPONSED',
      templateCode: 'tmpl-nda',
    }

    const result = transformDocument(raw, 'set-001', 0)

    // id composed from envelopeId:externalId (message code)
    expect(result.id).toBe('set-001:msg-1')
    expect(result.externalId).toBe('msg-1')
    expect(result.envelopeId).toBe('set-001')
    expect(result.name).toBe('Contract.pdf')
    // always PDF for viafirma
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('viafirma')
    expect(result.metadata.messageCode).toBe('msg-1')
    expect(result.metadata.templateCode).toBe('tmpl-nda')
    expect(result.metadata.status).toBe('RESPONSED')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelopeId:order when code is absent', () => {
    const raw: RawViafirmaMessage = { title: 'doc.pdf' }
    const result = transformDocument(raw, 'set-002', 3)
    expect(result.externalId).toBe('set-002:3')
    expect(result.id).toBe('set-002:set-002:3')
    expect(result.name).toBe('doc.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name when title absent', () => {
    const raw: RawViafirmaMessage = { code: 'msg-x' }
    const result = transformDocument(raw, 'set-003', 2)
    expect(result.name).toBe('document-2')
  })
})
