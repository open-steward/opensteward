/**
 * Moov adapter: credential form, Basic auth, transfer reads and refusals.
 *
 * Auth (https://docs.moov.io/api/authentication/api-authentication/): "You can
 * use your API key's public and private keys with Basic authentication."
 * Reads (https://docs.moov.io/api/money-movement/transfers/list/ and /get/):
 * "GET /accounts/{accountID}/transfers" and
 * "GET /accounts/{accountID}/transfers/{transferID}".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { _resetRowPager } from '@opensteward/shared'
import { MoovAdapter } from '../../../../../../src/verticals/payments/adapters/moov/index'
import { installFakeMoov, type FakeMoov } from './fake'
import {
  ACH_FUND_TRANSFER,
  ACH_PAYOUT_TRANSFER,
  CARD_PAYMENT_TRANSFER,
  MERCHANT,
  PUSH_TO_CARD_PAYOUT,
} from './fixtures'

const FIELDS = { publicKey: 'pub_123', privateKey: 'priv_456', accountID: MERCHANT }

describe('Moov credential form', () => {
  const adapter = new MoovAdapter()

  it('asks for the public key, private key and account ID', () => {
    const fields = adapter.credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['publicKey', 'text', true],
      ['privateKey', 'password', true],
      ['accountID', 'text', true],
    ])
  })

  it('stores the Basic credential and the account ID', async () => {
    const creds = await adapter.exchangeCredentials({
      publicKey: ' pub_123 ',
      privateKey: 'priv_456',
      accountID: ` ${MERCHANT} `,
    })
    expect(creds.accessToken).toBe(Buffer.from('pub_123:priv_456').toString('base64'))
    expect(creds.extra).toEqual({ accountID: MERCHANT })
    expect(creds.refreshToken).toBeUndefined()
    await expect(adapter.refreshCredentials(creds)).resolves.toBe(creds)
  })

  it.each(['publicKey', 'privateKey', 'accountID'])('refuses a form without %s', async (name) => {
    await expect(adapter.exchangeCredentials({ ...FIELDS, [name]: '  ' })).rejects.toThrow(name)
  })
})

describe('Moov reads over the transfers API', () => {
  const adapter = new MoovAdapter()
  let fake: FakeMoov
  let creds: Awaited<ReturnType<MoovAdapter['exchangeCredentials']>>

  beforeEach(async () => {
    _resetRowPager()
    fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: FIELDS.publicKey,
      privateKey: FIELDS.privateKey,
      transfers: [
        CARD_PAYMENT_TRANSFER,
        ACH_PAYOUT_TRANSFER,
        ACH_FUND_TRANSFER,
        PUSH_TO_CARD_PAYOUT,
      ],
    })
    creds = await adapter.exchangeCredentials(FIELDS)
  })
  afterEach(() => fake.restore())

  it('lists charges with Basic auth, the pinned API version and documented paging only', async () => {
    const charges = await adapter.listCharges(creds, { page: 1, limit: 10 })
    expect(charges.map((c) => c.id)).toEqual([CARD_PAYMENT_TRANSFER.transferID])
    expect(fake.requests).toHaveLength(1)
    const [req] = fake.requests
    expect(req!.method).toBe('GET')
    expect(req!.url).toBe(`https://api.moov.io/accounts/${MERCHANT}/transfers`)
    expect(req!.params).toEqual({ skip: 0, count: 200 })
    expect(req!.headers['Authorization']).toBe(
      `Basic ${Buffer.from('pub_123:priv_456').toString('base64')}`,
    )
    // "Set this header to v2026.07.00 to use the API described in this specification."
    expect(req!.headers['X-Moov-Version']).toBe('v2026.07.00')
  })

  it('lists payouts: wallet → bank and wallet → card, not funding or charges', async () => {
    const payouts = await adapter.listPayouts(creds, { page: 1, limit: 10 })
    expect(payouts.map((p) => p.id)).toEqual([
      ACH_PAYOUT_TRANSFER.transferID,
      PUSH_TO_CARD_PAYOUT.transferID,
    ])
  })

  it('does not send updatedAfter: Moov documents only a creation-time filter', async () => {
    await adapter.listCharges(creds, { page: 1, limit: 10, updatedAfter: new Date('2025-01-01') })
    expect(fake.requests[0]!.params).toEqual({ skip: 0, count: 200 })
  })

  it('gets a charge and a payout by transfer ID', async () => {
    const charge = await adapter.getCharge(creds, CARD_PAYMENT_TRANSFER.transferID)
    expect(charge.amount).toBe(1204)
    expect(fake.requests[0]!.url).toBe(
      `https://api.moov.io/accounts/${MERCHANT}/transfers/${CARD_PAYMENT_TRANSFER.transferID}`,
    )
    expect(fake.requests[0]!.params).toEqual({})
    const payout = await adapter.getPayout(creds, PUSH_TO_CARD_PAYOUT.transferID)
    expect(payout.destinationLast4).toBe('4242')
  })

  it('answers 404 for a transfer that is not a charge (or not a payout)', async () => {
    await expect(adapter.getCharge(creds, ACH_PAYOUT_TRANSFER.transferID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    await expect(adapter.getPayout(creds, CARD_PAYMENT_TRANSFER.transferID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    await expect(adapter.getPayout(creds, ACH_FUND_TRANSFER.transferID)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('escapes the transfer ID into the path', async () => {
    await expect(adapter.getCharge(creds, 'a/b')).rejects.toBeDefined()
    expect(fake.requests[0]!.url).toBe(`https://api.moov.io/accounts/${MERCHANT}/transfers/a%2Fb`)
  })
})

describe('Moov refusals send nothing', () => {
  const adapter = new MoovAdapter()
  const transport = vi.fn(async () => {
    throw new Error('network call attempted')
  })
  let originalAdapter: typeof axios.defaults.adapter
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    transport.mockClear()
    originalAdapter = axios.defaults.adapter
    axios.defaults.adapter = transport as never
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network call attempted'))
  })
  afterEach(() => {
    axios.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
  })

  it('getAuthUrl and exchangeCode throw: Moov has no authorization-code flow', async () => {
    expect(() => adapter.getAuthUrl('state')).toThrow(/Basic authentication/)
    await expect(adapter.exchangeCode('code', 'https://x/cb')).rejects.toThrow(
      /Basic authentication/,
    )
    expect(transport).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  const noAccount = { accessToken: Buffer.from('p:q').toString('base64'), extra: {} }
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listCharges', () => adapter.listCharges(noAccount, { page: 1, limit: 10 })],
    ['getCharge', () => adapter.getCharge(noAccount, 'id-1')],
    ['listPayouts', () => adapter.listPayouts(noAccount, { page: 1, limit: 10 })],
    ['getPayout', () => adapter.getPayout(noAccount, 'id-1')],
  ]
  for (const [name, call] of cases) {
    it(`${name} refuses a connection without an account ID before any request`, async () => {
      await expect(call()).rejects.toMatchObject({
        message: expect.stringMatching(/accountID/),
        statusCode: 401,
        code: 'RECONNECT_REQUIRED',
      })
      expect(transport).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }

  it('refuses a whitespace-only account ID before any request', async () => {
    const blank = { ...noAccount, extra: { accountID: '   ' } }
    await expect(adapter.listCharges(blank, { page: 1, limit: 10 })).rejects.toMatchObject({
      code: 'RECONNECT_REQUIRED',
    })
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('Moov list response guard', () => {
  it('refuses a list body that is not a transfer array', async () => {
    _resetRowPager()
    const original = axios.defaults.adapter
    axios.defaults.adapter = (async (config: { url?: string }) => ({
      data: { transfers: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })) as never
    try {
      const adapter = new MoovAdapter()
      const creds = await adapter.exchangeCredentials(FIELDS)
      await expect(adapter.listCharges(creds, { page: 1, limit: 10 })).rejects.toThrow(
        /returned no transfer array/,
      )
    } finally {
      axios.defaults.adapter = original
    }
  })
})
