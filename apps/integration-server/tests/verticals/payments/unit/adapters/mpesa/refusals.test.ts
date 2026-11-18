/**
 * M-Pesa (Safaricom Daraja) read methods refuse before sending anything.
 *
 * Daraja documents no GET /charges or /payouts (the adapter's former paths).
 * - Charges: the only documented list of incoming payments is Pull
 *   Transactions, which needs the merchant's ShortCode ("This is your paybill
 *   number/till number, which you expect to receive payments notifications
 *   about.") and a one-time Register Pull; the connection carries no ShortCode.
 * - Payouts: B2C results are pushed to a ResultURL ("The B2C API is
 *   asynchronous. You receive an acknowledgement immediately, but the actual
 *   transaction result is sent later to your specified ResultURL."); no
 *   endpoint lists or reads outgoing payments.
 * Source: https://developer.safaricom.co.ke/apis/PullTransaction and
 * https://developer.safaricom.co.ke/apis/BusinessToCustomer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
  create: vi.fn(),
}))

vi.mock('axios', () => {
  const instance = { get: axiosMocks.get, post: axiosMocks.post, request: axiosMocks.request }
  axiosMocks.create.mockReturnValue(instance)
  const axios = { ...instance, create: axiosMocks.create }
  return { default: axios, ...axios }
})

import { MpesaAdapter } from '../../../../../../src/verticals/payments/adapters/mpesa'

const CREDS: Credentials = { accessToken: 'tok' }

function adapter(): MpesaAdapter {
  return new MpesaAdapter({
    clientId: 'ck',
    clientSecret: 'cs',
    redirectUri: 'https://x.example/cb',
  })
}

function expectNoRequest(): void {
  expect(axiosMocks.get).not.toHaveBeenCalled()
  expect(axiosMocks.post).not.toHaveBeenCalled()
  expect(axiosMocks.request).not.toHaveBeenCalled()
  expect(axiosMocks.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  axiosMocks.get.mockReset().mockResolvedValue({ data: { data: [{ id: 'ch_1' }] } })
  axiosMocks.post.mockReset().mockResolvedValue({ data: { data: [{ id: 'ch_1' }] } })
  axiosMocks.request.mockReset()
  axiosMocks.create.mockClear()
})

describe('MpesaAdapter read methods refuse with 501 NOT_SUPPORTED', () => {
  it('listCharges refuses, naming the missing ShortCode, and sends no request', async () => {
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter().listCharges(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('this connection has no ShortCode'),
    })
    expectNoRequest()
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('listCharges refuses even when updatedAfter is given', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-26T00:00:00Z'),
    })
    await expect(adapter().listCharges(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expectNoRequest()
  })

  it('getCharge refuses and sends no request', async () => {
    await expect(adapter().getCharge(CREDS, 'LHG31AA5TX')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expectNoRequest()
  })

  it('listPayouts refuses, citing the ResultURL callback, and sends no request', async () => {
    const params = withPageSink({ page: 2, limit: 5 })
    await expect(adapter().listPayouts(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('ResultURL'),
    })
    expectNoRequest()
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('getPayout refuses and sends no request', async () => {
    await expect(adapter().getPayout(CREDS, 'po_1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expectNoRequest()
  })
})
