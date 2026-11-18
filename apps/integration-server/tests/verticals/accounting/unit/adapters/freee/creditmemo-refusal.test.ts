/**
 * freee credit memos are refused before any request.
 *
 * The adapter used to call `GET credit_invoices` and `GET credit_invoices/{id}`.
 * Neither freee's accounting API spec (v2020_06_15) nor its Invoice API spec
 * (https://github.com/freee/freee-api-schema, v2020_06_15/ and iv/) has a
 * credit invoice or credit note anywhere.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { FreeeAdapter } from '../../../../../../src/verticals/accounting/adapters/freee'

const CREDS = { accessToken: 'token' }
const adapter = () =>
  new FreeeAdapter({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://x.test/cb',
    scopes: [],
    companyId: 1,
  })

function spyHttp(): { calls: string[] } {
  const calls: string[] = []
  const record = async (path: string) => {
    calls.push(path)
    return { data: [] }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: record,
    post: record,
    put: record,
    delete: record,
  } as never)
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

describe('FreeeAdapter credit memos', () => {
  it('listCreditMemos answers 501 NOT_SUPPORTED without a request', async () => {
    const { calls } = spyHttp()
    await expect(
      adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('getCreditMemo answers 501 NOT_SUPPORTED without a request', async () => {
    const { calls } = spyHttp()
    await expect(adapter().getCreditMemo(CREDS, '42')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})
