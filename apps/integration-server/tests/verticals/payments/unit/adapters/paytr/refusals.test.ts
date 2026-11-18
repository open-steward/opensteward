import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { PaytrAdapter } from '../../../../../../src/verticals/payments/adapters/paytr/index'

/**
 * PayTR documents no customer resource and no GET /customers, /charges or
 * /refunds (https://dev.paytr.com/en, official Postman collection: every
 * request is a form POST signed with paytr_token). The only list-like source,
 * POST /rapor/islem-dokumu (https://dev.paytr.com/en/islem-dokumu), documents
 * row fields but neither the response key that holds the rows nor a per-row
 * id, so charges and refunds cannot be listed from documented fields. Each of
 * these reads must refuse with 501 NOT_SUPPORTED before any HTTP client is
 * built or any request is sent.
 */

const creds: Credentials = { accessToken: 'k', refreshToken: 's' }

function trapHttp() {
  const request = vi.fn(() => Promise.reject(new Error('no request may be sent')))
  const create = vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: request,
        post: request,
        delete: request,
        request,
      }) as unknown as ReturnType<typeof axios.create>,
  )
  return { create, request }
}

async function expectRefusal(p: Promise<unknown>, pattern: RegExp) {
  const err = await p.then(
    () => {
      throw new Error('expected a 501 refusal')
    },
    (e: unknown) => e as Error & { statusCode?: number; code?: string },
  )
  expect(err.statusCode).toBe(501)
  expect(err.code).toBe('NOT_SUPPORTED')
  expect(err.message).toMatch(pattern)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('paytr read refusals', () => {
  const adapter = new PaytrAdapter()

  it('listCustomers refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listCustomers(creds, { page: 1, limit: 10 }),
      /PayTR cannot list customers/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('getCustomer refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(adapter.getCustomer(creds, 'c1'), /PayTR cannot read customers/)
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('listCharges refuses 501 and sends no request, with or without updatedAfter', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listCharges(creds, { page: 1, limit: 10 }),
      /PayTR cannot list charges/,
    )
    await expectRefusal(
      adapter.listCharges(creds, {
        page: 1,
        limit: 10,
        updatedAfter: new Date('2026-09-01T00:00:00Z'),
      }),
      /PayTR cannot list charges/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('getCharge refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(adapter.getCharge(creds, 'ABC123'), /PayTR cannot read charges/)
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('listRefunds refuses 501 and sends no request, with or without updatedAfter', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listRefunds(creds, { page: 1, limit: 10 }),
      /PayTR cannot list refunds/,
    )
    await expectRefusal(
      adapter.listRefunds(creds, {
        page: 1,
        limit: 10,
        updatedAfter: new Date('2026-09-01T00:00:00Z'),
      }),
      /PayTR cannot list refunds/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
})
