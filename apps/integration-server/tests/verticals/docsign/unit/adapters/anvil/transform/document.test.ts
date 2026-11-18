import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawAnvilFile,
} from '../../../../../../../src/verticals/docsign/adapters/anvil/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('anvil transformDocument', () => {
  it('maps a full raw file to canonical Document', () => {
    const raw: RawAnvilFile = {
      eid: 'file-001',
      name: 'Contract.pdf',
      filename: 'contract_v2.pdf',
      type: 'pdf',
    }

    const result = transformDocument(raw, 'pkt-001', 0)

    // id is envelopeId:fileEid
    expect(result.id).toBe('pkt-001:file-001')
    // externalId is fileEid alone
    expect(result.externalId).toBe('file-001')
    expect(result.envelopeId).toBe('pkt-001')
    // name prefers raw.name
    expect(result.name).toBe('Contract.pdf')
    // type 'pdf' → 'application/pdf'
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('anvil')
    expect(result.metadata.filename).toBe('contract_v2.pdf')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to filename then title then document-<n>', () => {
    const r1 = transformDocument({ filename: 'fallback.pdf', eid: 'e1' }, 'pkt', 0)
    expect(r1.name).toBe('fallback.pdf')

    const r2 = transformDocument({ title: 'My Title', eid: 'e2' }, 'pkt', 1)
    expect(r2.name).toBe('My Title')

    const r3 = transformDocument({ eid: 'e3' }, 'pkt', 2)
    expect(r3.name).toBe('document-2')
  })

  it('uses raw.id when eid is absent for externalId', () => {
    const raw: RawAnvilFile = { id: 'id-only', name: 'file.pdf' }
    const result = transformDocument(raw, 'pkt-1', 0)
    expect(result.externalId).toBe('id-only')
    expect(result.id).toBe('pkt-1:id-only')
  })

  it('passes non-pdf type through unchanged', () => {
    const raw: RawAnvilFile = { eid: 'f1', name: 'data.xlsx', type: 'xlsx' }
    const result = transformDocument(raw, 'pkt', 0)
    expect(result.mimeType).toBe('xlsx')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to order index when eid and id both absent', () => {
    const raw: RawAnvilFile = { name: 'doc.pdf' }
    const result = transformDocument(raw, 'pkt', 5)
    // anvilFileId falls back to String(index) = '5'
    expect(result.externalId).toBe('5')
    expect(result.id).toBe('pkt:5')
  })
})
