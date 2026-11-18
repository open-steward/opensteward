/**
 * NorceClient — request shape (base URL, auth headers, OData query params)
 * and pagination. Docs:
 * https://docs.norce.io/api-reference/query/queryproducts/openapi
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { NorceClient, odataKey } from '../../../../../../src/verticals/ecommerce/adapters/norce/client'

const CREDENTIALS = {
  accessToken: 'tok_1',
  extra: { host: 'acme.api-se.norce.tech', applicationId: '1000' },
}

describe('odataKey', () => {
  it('leaves a numeric id unquoted', () => {
    expect(odataKey('123')).toBe('123')
  })

  it('single-quotes a non-numeric id and escapes embedded quotes', () => {
    expect(odataKey('abc')).toBe("'abc'")
    expect(odataKey("a'b")).toBe("'a''b'")
  })
})

describe('NorceClient construction', () => {
  it('throws when host is missing', () => {
    expect(() => new NorceClient({ accessToken: 'x', extra: { applicationId: '1' } })).toThrow(
      /extra.host is required/,
    )
  })

  it('throws when applicationId is missing', () => {
    expect(
      () => new NorceClient({ accessToken: 'x', extra: { host: 'h.norce.tech' } }),
    ).toThrow(/extra.applicationId is required/)
  })

  it('throws when accessToken is missing', () => {
    expect(
      () => new NorceClient({ extra: { host: 'h.norce.tech', applicationId: '1' } } as never),
    ).toThrow(/accessToken is required/)
  })

  it('builds the base URL and Authorization/ApplicationId headers', () => {
    const create = vi.spyOn(axios, 'create')
    new NorceClient(CREDENTIALS)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://acme.api-se.norce.tech/commerce/query/2.0',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok_1',
          ApplicationId: '1000',
        }),
      }),
    )
    create.mockRestore()
  })
})

describe('NorceClient.list', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends $top/$skip and clamps $top to the documented ceiling', async () => {
    const get = vi.fn().mockResolvedValue({ data: { value: [] } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const client = new NorceClient(CREDENTIALS)
    await client.list('Products/Products', { top: 500, skip: 50 })

    expect(get).toHaveBeenCalledWith(
      'Products/Products',
      expect.objectContaining({ params: expect.objectContaining({ $top: 100, $skip: 50 }) }),
    )
  })

  it('requests an inline count only when asked, and returns items + totalCount', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ data: { value: [{ Id: 1 }], '@odata.count': 5 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const client = new NorceClient(CREDENTIALS)
    const res = await client.list<{ Id: number }>('Products/Products', { top: 10, count: true })

    expect(get.mock.calls[0]![1].params['$count']).toBe(true)
    expect(res.items).toEqual([{ Id: 1 }])
    expect(res.totalCount).toBe(5)
  })

  it('omits $count when not requested and reports totalCount as undefined', async () => {
    const get = vi.fn().mockResolvedValue({ data: { value: [] } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const client = new NorceClient(CREDENTIALS)
    const res = await client.list('Products/Products', { top: 10 })

    expect(get.mock.calls[0]![1].params['$count']).toBeUndefined()
    expect(res.totalCount).toBeUndefined()
  })
})

describe('NorceClient.getById', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('addresses a single entity with the OData key syntax', async () => {
    const get = vi.fn().mockResolvedValue({ data: { Id: 42 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const client = new NorceClient(CREDENTIALS)
    await client.getById('Products/Products', '42')

    expect(get).toHaveBeenCalledWith('Products/Products(42)')
  })
})
