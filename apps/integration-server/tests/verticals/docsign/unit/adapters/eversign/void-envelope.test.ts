import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { EversignClient } from '../../../../../../src/verticals/docsign/adapters/eversign/client'
import { EversignAdapter } from '../../../../../../src/verticals/docsign/adapters/eversign'

/**
 * https://eversign.com/api/documentation/methods — Cancel Document:
 * "A document can be cancelled by making an HTTP DELETE call to the API's
 * document endpoint and appending both the document_hash GET parameter
 * containing the document hash and the cancel GET parameter and setting it
 * to 1."
 *
 * The same DELETE without `cancel=1` is Delete Document, which removes the
 * document instead of voiding it.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const HASH = 'j6yMcaF2gQBIIS'

afterEach(() => vi.restoreAllMocks())

const adapter = new EversignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

describe('EversignAdapter.voidEnvelope', () => {
  it('sends the documented Cancel Document request: DELETE /document with document_hash and cancel=1', async () => {
    const del = vi
      .spyOn(EversignClient.prototype, 'delete')
      .mockResolvedValue({ success: true } as never)
    vi.spyOn(EversignClient.prototype, 'get').mockResolvedValue({
      document_hash: HASH,
      title: 'Doc',
      is_cancelled: 1,
    } as never)

    await adapter.voidEnvelope(CREDS, HASH, { reason: 'ignored' })

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('/document', { document_hash: HASH, cancel: 1 })
  })

  it('sends access_key, document_hash and cancel=1 on the wire', async () => {
    const httpDelete = vi.fn().mockResolvedValue({ data: { success: true } })
    const client = new EversignClient(CREDS)
    ;(client as unknown as { http: { delete: typeof httpDelete } }).http.delete = httpDelete

    await client.delete('/document', { document_hash: HASH, cancel: 1 })

    expect(httpDelete).toHaveBeenCalledWith('/document', {
      params: { access_key: 'tok', document_hash: HASH, cancel: 1 },
    })
  })

  it('returns the envelope read AFTER the cancel, so it comes back voided', async () => {
    let cancelled = false
    const del = vi.spyOn(EversignClient.prototype, 'delete').mockImplementation(async () => {
      cancelled = true
      return { success: true } as never
    })
    // eversign reports the document as cancelled only once the cancel has
    // run, so a read taken before the DELETE comes back not voided.
    const get = vi.spyOn(EversignClient.prototype, 'get').mockImplementation(
      async () =>
        ({
          document_hash: HASH,
          title: 'Doc',
          is_cancelled: cancelled ? 1 : 0,
        }) as never,
    )

    const env = await adapter.voidEnvelope(CREDS, HASH)

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/document', { document_hash: HASH })
    expect(del.mock.invocationCallOrder[0]!).toBeLessThan(get.mock.invocationCallOrder[0]!)
    expect(env.id).toBe(HASH)
    expect(env.status).toBe('voided')
  })

  it('rejects when the cancel request fails, without reading the envelope', async () => {
    vi.spyOn(EversignClient.prototype, 'delete').mockRejectedValue(new Error('network down'))
    const get = vi
      .spyOn(EversignClient.prototype, 'get')
      .mockResolvedValue({ document_hash: HASH, title: 'Doc', is_cancelled: 0 } as never)

    await expect(adapter.voidEnvelope(CREDS, HASH)).rejects.toThrow(/network down/)
    expect(get).not.toHaveBeenCalled()
  })

  it('rejects on the documented error envelope, which eversign sends with HTTP 200', async () => {
    // Methods page, Errors: "Errors always carry \"success\": false, an error
    // code, a type object and an info string." A live unauthenticated DELETE
    // returned exactly that body with HTTP 200, so axios does not throw.
    vi.spyOn(EversignClient.prototype, 'delete').mockResolvedValue({
      success: false,
      error: {
        code: 101,
        type: 'invalid_access_key',
        info: 'You have not supplied a valid API Access Key.',
      },
    } as never)
    const get = vi
      .spyOn(EversignClient.prototype, 'get')
      .mockResolvedValue({ document_hash: HASH, title: 'Doc', is_cancelled: 0 } as never)

    await expect(adapter.voidEnvelope(CREDS, HASH)).rejects.toThrow(
      /not supplied a valid API Access Key/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
