import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { YapilyAdapter } from '../../../../../../src/verticals/payments/adapters/yapily/index'

const creds = { accessToken: 'tok' } as never

describe('yapily charge/payout reads refuse before sending (no documented resource)', () => {
  const adapter = new YapilyAdapter({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://x/cb',
  })
  // Stub the transport, not individual verbs: every axios call (get, post,
  // request, created instances) dispatches through defaults.adapter, and
  // fetch covers any non-axios client.
  const transport = vi.fn(async () => {
    throw new Error('network call attempted')
  })
  let originalAdapter: typeof axios.defaults.adapter
  let create: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    transport.mockClear()
    originalAdapter = axios.defaults.adapter
    axios.defaults.adapter = transport as never
    create = vi.spyOn(axios, 'create')
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network call attempted'))
  })
  afterEach(() => {
    axios.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
  })

  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listCharges', () => adapter.listCharges(creds, { page: 1, limit: 10 })],
    ['getCharge', () => adapter.getCharge(creds, 'id-1')],
    ['listPayouts', () => adapter.listPayouts(creds, { page: 1, limit: 10 })],
    ['getPayout', () => adapter.getPayout(creds, 'id-1')],
  ]

  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Yapily cannot .*GET \/payments\/\{paymentId\}\/details/),
      })
      expect(transport).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }
})
