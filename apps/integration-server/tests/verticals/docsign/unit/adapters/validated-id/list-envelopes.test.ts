/**
 * Validated ID (VIDsigner) listEnvelopes refusal.
 *
 * The first-party VIDcloud spec (https://vidsignercloud.validatedid.com/3.0/swagger,
 * served to the Swagger UI at https://vidsignercloud.validatedid.com/swagger/ui/index)
 * documents the only document listing as `GET /api/v{version}/documentlist/{id}`,
 * "Returns a list of documents by specific type", where `id` is a type
 * ("<all> <unsigned> <rejected> <signed> <signeddownloaded> <signednotdownloaded>")
 * paged by `paginationDTO.pageNumber` / `paginationDTO.pageSize`. Its 200
 * response is documented only as `"schema": { "type": "object" }`: the spec
 * names no property that holds the documents, no item schema and no total, and
 * does not say whether `pageNumber` starts at 0 or 1. The adapter therefore
 * cannot read a page without inventing its shape, and refuses before sending
 * anything.
 */
import axios from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ValidatedIdAdapter } from '../../../../../../src/verticals/docsign/adapters/validated-id'

const CREDS: Credentials = {
  accessToken: 'dXNlcjpwYXNz',
  extra: { baseUrl: 'https://pre-vidsignercloud.validatedid.com/api' },
}

const adapter = new ValidatedIdAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function fakeAxios() {
  const sent: string[] = []
  vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async (config) => {
    sent.push(String((config as { url?: string }).url))
    throw new Error('no request may be sent')
  })
  return sent
}

describe('ValidatedIdAdapter.listEnvelopes', () => {
  it.each([
    ['first page', { page: 1, limit: 2 }],
    ['later page', { page: 3, limit: 50 }],
    ['no paging params', {}],
  ] as const)('%s: throws 501 NOT_SUPPORTED and sends no request', async (_name, params) => {
    const sent = fakeAxios()
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ ...params }))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })

  it('names the undocumented documentlist response in the refusal', async () => {
    fakeAxios()
    await expect(adapter.listEnvelopes(CREDS, withPageSink({}))).rejects.toThrow(
      /documentlist\/\{id\}.*"type": "object"/,
    )
  })
})
