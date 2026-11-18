/**
 * Xero and FreshBooks both resolve the tenant/account identity during exchangeCode.
 * That id is not optional decoration: Xero sends it as the `Xero-tenant-id` header on
 * every call and matches it against inbound webhooks, and FreshBooks interpolates it
 * into every request path (`accounting/account/<id>/...`).
 *
 * Swallowing the lookup failure hands back credentials that look complete, so the
 * connect flow reports success and stores a connection that cannot make a single
 * working request. "The tenant lookup failed" and "this grant has no organisations"
 * must not collapse into the same undefined.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { exchangeCode as xeroExchangeCode } from '../../../../../src/verticals/accounting/adapters/xero/auth'
import { exchangeCode as freshbooksExchangeCode } from '../../../../../src/verticals/accounting/adapters/freshbooks/auth'

afterEach(() => vi.restoreAllMocks())

const tokenPayload = {
  data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 },
}

describe('Xero exchangeCode tenant lookup', () => {
  it('propagates a failing connections call instead of storing a tenant-less credential', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenPayload as never)
    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('Request failed with status code 503'), {
        isAxiosError: true,
        response: { status: 503, data: {} },
      }),
    )
    await expect(xeroExchangeCode('code', 'id', 'secret', 'https://cb')).rejects.toThrow()
  })

  it('still allows a grant that legitimately has no organisations', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenPayload as never)
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [] } as never)
    const creds = await xeroExchangeCode('code', 'id', 'secret', 'https://cb')
    expect(creds.tenantId).toBeUndefined()
  })

  it('picks the ORGANISATION tenant on success', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenPayload as never)
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [{ tenantId: 't-1', tenantType: 'ORGANISATION' }],
    } as never)
    const creds = await xeroExchangeCode('code', 'id', 'secret', 'https://cb')
    expect(creds.tenantId).toBe('t-1')
  })
})

describe('FreshBooks exchangeCode account lookup', () => {
  it('propagates a failing /users/me call instead of storing an account-less credential', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenPayload as never)
    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      }),
    )
    await expect(freshbooksExchangeCode('code', 'id', 'secret', 'https://cb')).rejects.toThrow()
  })

  it('captures the business account id on success', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenPayload as never)
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { response: { id: 'u1', business_memberships: [{ business: { account_id: 'acct-9' } }] } },
    } as never)
    const creds = await freshbooksExchangeCode('code', 'id', 'secret', 'https://cb')
    expect(creds.tenantId).toBe('acct-9')
  })
})
