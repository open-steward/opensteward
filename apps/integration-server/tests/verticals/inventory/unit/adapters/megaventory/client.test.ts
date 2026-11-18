import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  MegaventoryClient,
  MegaventoryError,
} from '../../../../../../src/verticals/inventory/adapters/megaventory/client'
import type { Credentials } from '@opensteward/shared'

/**
 * Megaventory reports failure IN-BAND on an HTTP 200.
 *
 * Verified live on 2026-09-18: ProductGet with no key and with a junk key both
 * answer 200 with an empty mvProducts array and ResponseStatus.ErrorCode 500.
 * A client that only inspects the HTTP status sees a successful empty list, so
 * an unauthenticated sync "completes" with zero rows instead of failing — the
 * single most misleading outcome an adapter can produce.
 */
const post = vi.fn()

beforeEach(() => {
  post.mockReset()
  vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function client(): MegaventoryClient {
  return new MegaventoryClient({ accessToken: 'the-key' } as Credentials)
}

describe('megaventory client', () => {
  it('raises on an in-band error even though the HTTP status is 200', async () => {
    post.mockResolvedValue({
      status: 200,
      data: {
        mvProducts: [],
        ResponseStatus: {
          ErrorCode: '500',
          Message: 'A valid API key should be supplied.',
          Errors: [{ ErrorCode: 'GenericError', Message: 'A valid API key should be supplied.' }],
        },
      },
    })
    await expect(client().call('ProductGet', 'mvProducts')).rejects.toBeInstanceOf(
      MegaventoryError,
    )
  })

  it('names the operation and the vendor message in the error', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { mvProducts: [], ResponseStatus: { ErrorCode: '500', Message: 'bad key' } },
    })
    await expect(client().call('ProductGet', 'mvProducts')).rejects.toThrow(
      /Megaventory ProductGet failed \(500\): bad key/,
    )
  })

  it('treats ErrorCode "0" as success', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { mvProducts: [{ ProductID: 1 }], ResponseStatus: { ErrorCode: '0' } },
    })
    await expect(client().call('ProductGet', 'mvProducts')).resolves.toEqual([{ ProductID: 1 }])
  })

  it('sends the key as APIKEY in the body, not as a Bearer header', async () => {
    // Megaventory reads no Authorization header. The previous client sent a
    // Bearer token, which the service ignored while answering 200 with an
    // empty array — indistinguishable from an account with no products.
    post.mockResolvedValue({ status: 200, data: { mvProducts: [] } })
    await client().call('ProductGet', 'mvProducts', { ReturnTopNRecords: 5 })
    expect(post).toHaveBeenCalledWith('/ProductGet', {
      APIKEY: 'the-key',
      ReturnTopNRecords: 5,
    })
  })

  it('returns an empty array when the named key is missing', async () => {
    post.mockResolvedValue({ status: 200, data: { ResponseStatus: { ErrorCode: '0' } } })
    await expect(client().call('ProductGet', 'mvProducts')).resolves.toEqual([])
  })
})
