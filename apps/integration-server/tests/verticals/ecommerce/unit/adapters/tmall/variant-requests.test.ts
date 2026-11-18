/**
 * Tmall: `listVariants`/`getVariant` were entirely unimplemented
 * (router/variants.ts returned 501 for every call). TOP has no unscoped
 * variant list — `taobao.item.skus.get` takes `num_iids` (up to 40 product
 * ids); `taobao.item.sku.get` takes `sku_id` plus `num_iid`. These pin the
 * exact TOP method names and request params, not just the transform (which
 * `transform/product.test.ts` already covers via `transformVariant`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { TmallAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tmall/index'
import { ProductVariantSchema } from '../../../../../../src/verticals/ecommerce/schema/product'

const CREDS = {
  accessToken: 'session-tok',
  extra: { appKey: 'key123', appSecret: 'secret456' },
}

interface Call {
  params: URLSearchParams
}

function fakeHttp(answer: (params: URLSearchParams) => unknown) {
  const calls: Call[] = []
  const post = vi.fn(async (_url: string, body: string) => {
    const params = new URLSearchParams(body)
    calls.push({ params })
    return { data: answer(params) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post, calls }
}

afterEach(() => vi.restoreAllMocks())

// Whole-number prices: `transformVariant`'s minor-units conversion is a
// separate, pre-existing gap (canonical `Money.amount` is meant to be
// integer minor units; `parseTmallPrice` returns the decimal major-unit
// value unconverted) that is out of scope here — picking a fractional
// fixture here would fail `ProductVariantSchema.parse` for a reason that has
// nothing to do with the request/response wiring these tests pin.
const RAW_SKU_1 = {
  sku_id: 111,
  num_iid: 999,
  properties_name: '颜色分类:黑色',
  price: '19.00',
  outer_id: 'SKU-BLK',
}
const RAW_SKU_2 = {
  sku_id: 112,
  num_iid: 999,
  properties_name: '颜色分类:白色',
  price: '21.00',
  outer_id: 'SKU-WHT',
}

describe('TmallAdapter.listVariants', () => {
  it('calls taobao.item.skus.get with fields and num_iids', async () => {
    const { calls } = fakeHttp((params) => {
      expect(params.get('method')).toBe('taobao.item.skus.get')
      return { item_skus_get_response: { skus: { sku: [RAW_SKU_1, RAW_SKU_2] } } }
    })

    const out = await new TmallAdapter().listVariants(CREDS, { productId: '999' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.params.get('num_iids')).toBe('999')
    expect(calls[0]!.params.get('fields')).toContain('sku_id')
    expect(calls[0]!.params.get('fields')).toContain('num_iid')
    // No page params — taobao.item.skus.get is bounded by num_iids, not paged.
    expect(calls[0]!.params.get('page_no')).toBeNull()

    expect(out).toHaveLength(2)
    expect(out[0]!.id).toBe('999:111')
    expect(out[0]!.productId).toBe('999')
    expect(out[0]!.sku).toBe('SKU-BLK')
    expect(out[0]!.price).toEqual({ amount: 1900, currency: 'CNY' })
    for (const v of out) expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('accepts a comma-separated productId list and forwards it verbatim as num_iids', async () => {
    const { calls } = fakeHttp(() => ({ item_skus_get_response: { skus: { sku: [] } } }))

    await new TmallAdapter().listVariants(CREDS, { productId: '111, 222 ,333' })

    expect(calls[0]!.params.get('num_iids')).toBe('111,222,333')
  })

  it('falls back to no results, not an error, when TOP returns no skus', async () => {
    fakeHttp(() => ({ item_skus_get_response: {} }))
    await expect(
      new TmallAdapter().listVariants(CREDS, { productId: '999' }),
    ).resolves.toEqual([])
  })

  it('throws a 400 when productId is missing — there is no unscoped list', async () => {
    const { post } = fakeHttp(() => ({}))
    await expect(new TmallAdapter().listVariants(CREDS, {})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('throws a 400 rather than calling TOP when more than 40 product ids are given', async () => {
    const { post } = fakeHttp(() => ({}))
    const many = Array.from({ length: 41 }, (_, i) => String(i)).join(',')
    await expect(
      new TmallAdapter().listVariants(CREDS, { productId: many }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(post).not.toHaveBeenCalled()
  })
})

describe('TmallAdapter.getVariant', () => {
  it('calls taobao.item.sku.get with sku_id and num_iid split from a composite id', async () => {
    const { calls } = fakeHttp((params) => {
      expect(params.get('method')).toBe('taobao.item.sku.get')
      return { item_sku_get_response: { sku: RAW_SKU_1 } }
    })

    const out = await new TmallAdapter().getVariant(CREDS, '999:111')

    expect(calls[0]!.params.get('sku_id')).toBe('111')
    expect(calls[0]!.params.get('num_iid')).toBe('999')
    expect(out.id).toBe('999:111')
    expect(out.productId).toBe('999')
    expect(() => ProductVariantSchema.parse(out)).not.toThrow()
  })

  it('throws a 400 for a bare sku_id with no num_iid — TOP requires one of num_iid/nick', async () => {
    const { post } = fakeHttp(() => ({}))
    await expect(new TmallAdapter().getVariant(CREDS, '111')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('throws a 404 when TOP returns no sku for the id', async () => {
    fakeHttp(() => ({ item_sku_get_response: {} }))
    await expect(new TmallAdapter().getVariant(CREDS, '999:111')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
