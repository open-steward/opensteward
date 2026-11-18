import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawIroncladDocument,
} from '../../../../../../../src/verticals/docsign/adapters/ironclad/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const baseDoc: RawIroncladDocument = {
  key: 'doc-key-1',
  filename: 'partnership-agreement.pdf',
  version: 'v3',
  versionNumber: 3,
  download: 'https://example.com/docs/partnership-agreement.pdf',
  lastModified: {
    timestamp: '2025-06-01T12:00:00.000Z',
    author: { displayName: 'Olivia Admin', email: 'olivia@example.com' },
  },
}

describe('ironclad transformDocument', () => {
  it('maps id and externalId from key', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.id).toBe('doc-key-1')
    expect(result.externalId).toBe('doc-key-1')
  })

  it('maps envelopeId from second argument', () => {
    const result = transformDocument(baseDoc, 'wf-42', 0, true)
    expect(result.envelopeId).toBe('wf-42')
  })

  it('maps name from filename', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.name).toBe('partnership-agreement.pdf')
  })

  it('sets mimeType to application/pdf (always)', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order from third argument', () => {
    const result = transformDocument(baseDoc, 'wf-1', 5, true)
    expect(result.order).toBe(5)
  })

  it('sets platform to ironclad', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.platform).toBe('ironclad')
  })

  it('stores version and versionNumber in metadata', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.metadata['version']).toBe('v3')
    expect(result.metadata['versionNumber']).toBe('3')
  })

  it('stores inSignaturePacket in metadata (true)', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.metadata['inSignaturePacket']).toBe('true')
  })

  it('stores inSignaturePacket in metadata (false)', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, false)
    expect(result.metadata['inSignaturePacket']).toBe('false')
  })

  it('stores lastModifiedAt from lastModified.timestamp in metadata', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.metadata['lastModifiedAt']).toBe('2025-06-01T12:00:00.000Z')
  })

  it('stores lastModifiedBy from lastModified.author.email in metadata', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(result.metadata['lastModifiedBy']).toBe('olivia@example.com')
  })

  it('does NOT expose the download URL in any field (content firewall)', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true) as Record<string, unknown>
    expect(result['download']).toBeUndefined()
    expect(result['url']).toBeUndefined()
    expect(result['content']).toBeUndefined()
  })

  it('falls back to compound id when key is absent', () => {
    const { key, ...noKey } = baseDoc
    const result = transformDocument(noKey, 'wf-1', 2, false)
    expect(result.id).toBe('wf-1:2')
  })

  it('defaults name to document-{order} when filename absent', () => {
    const { filename, ...noFilename } = baseDoc
    const result = transformDocument(noFilename, 'wf-1', 3, false)
    expect(result.name).toBe('document-3')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(baseDoc, 'wf-1', 0, true)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('passes DocumentSchema validation for minimal input', () => {
    const result = transformDocument({}, 'wf-1', 0, false)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
