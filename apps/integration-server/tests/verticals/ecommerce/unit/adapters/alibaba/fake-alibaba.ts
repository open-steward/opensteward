/**
 * A fake Alibaba.com REST gateway for the adapter tests. It replaces
 * axios.create, checks every call's system parameters and signature, and
 * honours ONLY the parameters each API documents (the "parameters" of its
 * getApi.json reference); anything else, a page_size over the documented
 * maximum, or a malformed page is answered with a gateway error instead of
 * being ignored.
 */
import { vi } from 'vitest'
import axios from 'axios'
import { buildSign } from '../../../../../../src/verticals/ecommerce/adapters/alibaba/auth'

export const APP_KEY = 'app-key'
export const APP_SECRET = 'app-secret'
export const TOKEN = 'seller-token'
export const CREDS = {
  accessToken: TOKEN,
  refreshToken: 'seller-refresh',
  extra: { appKey: APP_KEY, appSecret: APP_SECRET },
}

/** Documented request parameters, per API path. */
export const DOCUMENTED: Record<string, string[]> = {
  '/alibaba/icbu/product/list': [
    'current_page',
    'subject',
    'page_size',
    'gmt_modified_from',
    'group_id2',
    'group_id3',
    'group_id1',
    'gmt_modified_to',
    'id',
    'category_id',
  ],
  '/alibaba/icbu/product/get/v2': ['product_id', 'sku_id'],
  '/icbu/product/inventory/get': ['product_id', 'language'],
  '/alibaba/order/list': [
    'start_page',
    'role',
    'modified_date_start',
    'page_size',
    'sales_man_login_id',
    'modified_date_end',
    'create_date_start',
    'create_date_end',
    'status',
  ],
  '/alibaba/order/get': ['e_trade_id', 'data_select', 'language'],
  '/order/logistics/query': ['trade_id', 'data_select'],
  '/alibaba/icbu/category/get/v2': ['parent_category_id'],
  '/icbu/product/category/get': ['cat_id'],
}

const SYSTEM = ['app_key', 'timestamp', 'sign_method', 'access_token', 'sign']

export interface SentCall {
  path: string
  params: Record<string, string>
}

export type Handler = (params: Record<string, string>) => unknown

function gatewayError(code: string, message: string): { data: unknown } {
  return { data: { code, type: 'ISV', message, request_id: 'fake' } }
}

/** Installs the fake; returns the calls it received. */
export function fakeAlibaba(handlers: Record<string, Handler>): SentCall[] {
  const sent: SentCall[] = []
  const post = async (path: string, body: string): Promise<{ data: unknown }> => {
    const params = Object.fromEntries(new URLSearchParams(body))
    sent.push({ path, params })
    const documented = DOCUMENTED[path]
    const handler = handlers[path]
    if (!documented || !handler) return gatewayError('InvalidApiPath', `no API ${path}`)
    const { sign, ...rest } = params
    if (
      params['app_key'] !== APP_KEY ||
      params['access_token'] !== TOKEN ||
      params['sign_method'] !== 'sha256' ||
      !/^\d{13}$/.test(params['timestamp'] ?? '') ||
      sign !== buildSign(path, rest, APP_SECRET)
    ) {
      return gatewayError('IncompleteSignature', 'bad system parameters or signature')
    }
    const unknown = Object.keys(params).filter(
      (k) => !SYSTEM.includes(k) && !documented.includes(k),
    )
    if (unknown.length > 0)
      return gatewayError('InvalidParameter', `undocumented: ${unknown.join(',')}`)
    try {
      return { data: { code: '0', request_id: 'fake', ...(handler(params) as object) } }
    } catch (err) {
      return gatewayError('InvalidParameter', (err as Error).message)
    }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    post,
    get: async () => {
      throw new Error('fake alibaba: GET not used')
    },
  } as unknown as ReturnType<typeof axios.create>)
  return sent
}

/** An int parameter in [min, max], or throws (→ gateway error). */
export function intParam(
  params: Record<string, string>,
  name: string,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = params[name]
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} out of range: ${raw}`)
  return n
}
