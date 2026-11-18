import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/validated-id/transform/document'
import type { RawValidatedIdDocumentInfo } from '../../../../../../../src/verticals/docsign/adapters/validated-id/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('validated-id transformDocument', () => {
  const raw: RawValidatedIdDocumentInfo = {
    DocGUI: 'doc-gui-001',
    FileName: 'service-agreement.pdf',
    DocStatus: 'Unsigned',
    Downloaded: false,
  }

  it('maps id from DocGUI', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.id).toBe('doc-gui-001')
  })

  it('maps externalId from DocGUI', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.externalId).toBe('doc-gui-001')
  })

  it('preserves envelopeId', () => {
    const result = transformDocument(raw, 'env-xyz', 0)
    expect(result.envelopeId).toBe('env-xyz')
  })

  it('maps FileName to name', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.name).toBe('service-agreement.pdf')
  })

  it('falls back to document-<order> name when FileName is absent', () => {
    const result = transformDocument({ ...raw, FileName: undefined }, 'doc-gui-001', 2)
    expect(result.name).toBe('document-2')
  })

  it('sets mimeType to application/pdf', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('preserves order', () => {
    const result = transformDocument(raw, 'doc-gui-001', 5)
    expect(result.order).toBe(5)
  })

  it('sets platform to validated-id', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.platform).toBe('validated-id')
  })

  it('surfaces docStatus in metadata', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(result.metadata.docStatus).toBe('Unsigned')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, 'doc-gui-001', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
