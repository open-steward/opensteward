/**
 * CloudSignClient.put — added so voidEnvelope can call
 * PUT /documents/{id}/decline, which CloudSign takes as
 * application/x-www-form-urlencoded, not JSON (client.post always sends
 * application/json and cannot be reused here).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { CloudSignClient } from '../../../../../../src/verticals/docsign/adapters/cloudsign/client'
import type { Credentials } from '@opensteward/shared'

const creds = { accessToken: 'tok' } as Credentials

function fakeHttp(putImpl: (...args: unknown[]) => unknown) {
  const put = vi.fn(putImpl)
  vi.spyOn(axios, 'create').mockReturnValue({ put } as never)
  return put
}

afterEach(() => vi.restoreAllMocks())

describe('CloudSignClient.put', () => {
  it('sends a form-urlencoded body with an application/x-www-form-urlencoded header', async () => {
    const put = fakeHttp(() => ({ data: { id: 'doc_1', status: 5 } }))
    const client = new CloudSignClient(creds)

    const out = await client.put('/documents/doc_1/decline', { comment: 'no longer needed' })

    expect(out).toEqual({ id: 'doc_1', status: 5 })
    expect(put).toHaveBeenCalledTimes(1)
    const [path, body, config] = put.mock.calls[0]!
    expect(path).toBe('/documents/doc_1/decline')
    expect(body).toBe('comment=no+longer+needed')
    expect((config as { headers: Record<string, string> }).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    })
  })

  it('drops undefined/null fields instead of serializing the string "undefined"', async () => {
    const put = fakeHttp(() => ({ data: {} }))
    const client = new CloudSignClient(creds)

    await client.put('/documents/doc_2/decline', { comment: 'kept', extra: undefined, other: null })

    const [, body] = put.mock.calls[0]!
    expect(body).toBe('comment=kept')
  })

  it('sends an empty body when none is given', async () => {
    const put = fakeHttp(() => ({ data: {} }))
    const client = new CloudSignClient(creds)

    await client.put('/documents/doc_3/decline')

    const [, body] = put.mock.calls[0]!
    expect(body).toBe('')
  })
})
