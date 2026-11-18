/**
 * transformLabel maps `v1CreateLabelResponse` (POST /v1/companies/{company_id}/labels,
 * https://docs.api.loggi.com/reference/criaretiqueta-1). The fixtures are the
 * documented `urlResponse`, `contentResponse` and `partialSuccess` examples.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type LoggiLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/loggi/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

const urlResponse: LoggiLabelResponse = {
  success: {
    url: 'http://api.loggi.com.br/labels/label_para_download.pdf',
    createdTime: '2021-01-13T10:43:17Z',
  },
  failure: [],
}

const contentResponse: LoggiLabelResponse = {
  success: {
    content: 'DAxODQgMDAwMDAgbg0KMDAwMDAwMDA3OCAwMDAwMCBuDQowMDAwMDAwMjQxIDAwMDAwIG',
    createdTime: '2021-01-13T10:43:17Z',
  },
  failure: [],
}

const partialSuccess: LoggiLabelResponse = {
  success: {
    url: 'http://api.loggi.com.br/labels/label_para_download.pdf',
    createdTime: '2021-01-13T10:43:17Z',
  },
  failure: [
    { loggiKey: 'LJG622MH3UCOB4V9H3JOXFYO65', status: { code: '5', message: 'Not Found' } },
  ],
}

const KEY = 'KIF511LG3TBNA3U8G2INVEWO32'

describe('loggi transformLabel', () => {
  it('parses the documented urlResponse with the canonical LabelSchema', () => {
    const out = LabelSchema.parse(transformLabel(urlResponse, KEY))
    expect(out).toMatchObject({
      id: KEY,
      carrierId: 'loggi',
      format: 'PDF',
      status: 'CREATED',
      url: 'http://api.loggi.com.br/labels/label_para_download.pdf',
    })
    expect(out.createdAt?.toISOString()).toBe('2021-01-13T10:43:17.000Z')
  })

  it('puts the documented base64 content in base64, not url', () => {
    const out = LabelSchema.parse(transformLabel(contentResponse, KEY))
    expect(out.base64).toBe(contentResponse.success!.content)
    expect(out.url).toBeUndefined()
  })

  it('passes the tracking number through when the caller has one', () => {
    expect(transformLabel(urlResponse, KEY, 'AM1007503594LG').trackingNumber).toBe('AM1007503594LG')
  })

  it('throws 404 when Loggi lists the key under failure with NOT_FOUND (5)', () => {
    expect(() => transformLabel(partialSuccess, 'LJG622MH3UCOB4V9H3JOXFYO65')).toThrow(
      expect.objectContaining({ statusCode: 404, message: expect.stringMatching(/Not Found/) }),
    )
  })

  it('returns the label when the documented partialSuccess failure names a different key', () => {
    const out = LabelSchema.parse(transformLabel(partialSuccess, KEY))
    expect(out.id).toBe(KEY)
    expect(out.url).toBe('http://api.loggi.com.br/labels/label_para_download.pdf')
  })

  it('throws when neither url nor content comes back', () => {
    expect(() => transformLabel({ success: null, failure: [] }, KEY)).toThrow(
      expect.objectContaining({ statusCode: 502 }),
    )
  })
})
