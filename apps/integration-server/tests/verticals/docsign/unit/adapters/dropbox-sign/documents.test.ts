/**
 * Dropbox Sign documents are refused before any request.
 *
 * The only per-request files endpoint is "Download Files"
 * (https://developers.hellosign.com/api/reference/operation/signatureRequestFiles/):
 *   GET /signature_request/files/{signature_request_id}
 *   "Obtain a copy of the current documents specified by the
 *    `signature_request_id` parameter. Returns a PDF or ZIP file."
 *   file_type: "Set to `pdf` for a single merged document or `zip` for a
 *    collection of individual documents." (enum: pdf, zip)
 *
 * There is no `file_type=json` manifest, and the `files_as_file_url` variant
 * returns only `file_url` + `expires_at` for that one merged file. No
 * documented operation names or enumerates a request's documents, and
 * downloading the bytes is refused by the canonical Document schema.
 * The adapter used to call `?file_type=json` and read an invented `files`
 * array, so every envelope came back with no documents.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DropboxSignClient } from '../../../../../../src/verticals/docsign/adapters/dropbox-sign/client'
import { DropboxSignAdapter } from '../../../../../../src/verticals/docsign/adapters/dropbox-sign'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new DropboxSignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

function spyAll() {
  return [
    vi.spyOn(DropboxSignClient.prototype, 'get'),
    vi.spyOn(DropboxSignClient.prototype, 'post'),
    vi.spyOn(DropboxSignClient.prototype, 'put'),
    vi.spyOn(axios, 'create'),
    vi.spyOn(axios, 'get'),
    vi.spyOn(axios, 'request'),
  ]
}

async function expectRefusal(run: () => Promise<unknown>): Promise<void> {
  const spies = spyAll()
  const err = (await run().then(
    () => undefined,
    (e: unknown) => e,
  )) as { statusCode?: number; code?: string; message?: string } | undefined
  expect(err).toBeDefined()
  expect(err?.statusCode).toBe(501)
  expect(err?.code).toBe('NOT_SUPPORTED')
  expect(err?.message).toMatch(/^Dropbox Sign cannot/)
  for (const spy of spies) expect(spy).not.toHaveBeenCalled()
}

describe('DropboxSignAdapter documents', () => {
  it('listDocuments throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(() =>
      adapter.listDocuments(
        CREDS,
        'fa5c8a0b0f492d768749333ad6fcc214c111e967',
        withPageSink({ page: 1, limit: 20 }),
      ),
    )
  })

  it('getDocument throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(() =>
      adapter.getDocument(CREDS, 'fa5c8a0b0f492d768749333ad6fcc214c111e967:0'),
    )
  })
})
