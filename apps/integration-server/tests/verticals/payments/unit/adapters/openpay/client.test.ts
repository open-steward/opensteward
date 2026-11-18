/**
 * "Producción , URI base: https://api.openpay.mx" and "Un endpoint completo
 * esta formado por la URI base del ambiente, el identificador del comercio y el
 * recurso." Auth is HTTP Basic with the private key as username
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { OpenpayClient } from '../../../../../../src/verticals/payments/adapters/openpay/client'

describe('OpenpayClient', () => {
  it('bases every request on /v1/{MERCHANT_ID} with Basic auth', () => {
    const spy = vi.spyOn(axios, 'create')
    new OpenpayClient({ accessToken: 'c2tfeDo=' }, 'mzdtln0bmtms6o3kck8f')
    const cfg = spy.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://api.openpay.mx/v1/mzdtln0bmtms6o3kck8f')
    expect((cfg.headers as Record<string, string>).Authorization).toBe('Basic c2tfeDo=')
    spy.mockRestore()
  })
})
