import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawZealidDocument,
} from '../../../../../../../src/verticals/docsign/adapters/zealid/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('ZealiD transformDocument', () => {
  it('maps a fully-populated document to the canonical Document shape', () => {
    const raw: RawZealidDocument = {
      id: 'd772e574-abcd-1234-efgh-000000000001',
      name: 'my_document.pdf',
      type: 'pdf',
      status: 'signed',
      created: '2023-03-27 07:44:14',
      stored_until: '2023-04-26',
      signed: {
        expires: 1680266807,
        title: 'Sign via orpheus',
        url: 'https://example.com/download/d772e574',
      },
    }
    const customerId = 'cust_001'
    const result = transformDocument(raw, customerId, 0)

    // id comes from raw.id
    expect(result.id).toBe('d772e574-abcd-1234-efgh-000000000001')
    // externalId equals id for zealid
    expect(result.externalId).toBe(result.id)
    // envelopeId is the customer id (zealid has no envelope concept)
    expect(result.envelopeId).toBe('cust_001')
    // name from raw.name
    expect(result.name).toBe('my_document.pdf')
    // pdf type → application/pdf mime
    expect(result.mimeType).toBe('application/pdf')
    // order is passed through
    expect(result.order).toBe(0)
    // platform
    expect(result.platform).toBe('zealid')
    // metadata carries status, signed title and expiry — but NOT signed.url (content firewall)
    expect(result.metadata.status).toBe('signed')
    expect(result.metadata.signedTitle).toBe('Sign via orpheus')
    expect(result.metadata.signedExpires).toBe('1680266807')
    expect('url' in result.metadata).toBe(false)
    // content firewall: no top-level content/url fields either
    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback id and name when raw fields are absent', () => {
    const raw: RawZealidDocument = {}
    const result = transformDocument(raw, 'cust_002', 3)

    // fallback id: "<customerId>:doc:<order>"
    expect(result.id).toBe('cust_002:doc:3')
    expect(result.externalId).toBe('cust_002:doc:3')
    // fallback name: "document-<order>"
    expect(result.name).toBe('document-3')
    // missing type → application/pdf default
    expect(result.mimeType).toBe('application/pdf')
    expect(result.envelopeId).toBe('cust_002')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('passes an unknown type string through as mime type', () => {
    const raw: RawZealidDocument = {
      id: 'docx-id',
      name: 'report.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    const result = transformDocument(raw, 'cust_003', 1)

    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
