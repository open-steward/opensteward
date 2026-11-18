/**
 * ZorroSign (now ZaferSign) signers and documents refuse before sending.
 *
 * The first-party API page, https://www.zafersign.com/developers/api/ ("Formerly
 * ZorroSign"), lists the whole read surface as:
 *
 *   "Get Process Status, Details, Full Details, and All Processes"
 *
 * It names no recipients or documents resource and publishes no path, field
 * or parameter for one. The adapter used to call GET /packages/{id}/recipients
 * and GET /packages/{id}/documents on api.zorrosign.com, a host that does not
 * resolve. Each method must throw 501 NOT_SUPPORTED and send no request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  ZorrosignAdapter,
  ZAFERSIGN_DOCUMENTED_READS,
} from '../../../../../../src/verticals/docsign/adapters/zorrosign/index'

const CREDS = { accessToken: 'zs-api-key', extra: { baseUrl: 'https://example.invalid' } }

function spyHttp() {
  const get = vi.fn(async () => {
    throw new Error('a request was sent')
  })
  const post = vi.fn(get)
  const put = vi.fn(get)
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, put } as never)
  return { get, post, put }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const CASES: Array<[string, (a: ZorrosignAdapter) => Promise<unknown>]> = [
  ['listSigners', (a) => a.listSigners(CREDS, 'pkg-1', { page: 1, limit: 2 })],
  ['getSigner', (a) => a.getSigner(CREDS, 'pkg-1:r-1')],
  ['listDocuments', (a) => a.listDocuments(CREDS, 'pkg-1', { page: 1, limit: 2 })],
  ['getDocument', (a) => a.getDocument(CREDS, 'pkg-1:d-1')],
]

describe('ZorroSign signer/document refusals', () => {
  it('quotes the documented read surface verbatim', () => {
    expect(ZAFERSIGN_DOCUMENTED_READS).toBe(
      'Get Process Status, Details, Full Details, and All Processes',
    )
  })

  for (const [name, call] of CASES) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const http = spyHttp()
      const err = await call(new ZorrosignAdapter()).then(
        () => {
          throw new Error(`${name} resolved`)
        },
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expect(err.message).toContain(ZAFERSIGN_DOCUMENTED_READS)
      expect(axios.create).not.toHaveBeenCalled()
      expect(http.get).not.toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
      expect(http.put).not.toHaveBeenCalled()
    })
  }
})
