/**
 * Stark Bank request signing (https://docs.starkbank.com/api, CUSTOM HEADERS):
 * "Access-Id: ... project/{projectId} for projects" / "Access-Time: Current
 * Unix-Time" / "Access-Signature: Base64-encoded ECDSA signature of Access-Id
 * + ":" + Access-Time + ":" + body, where body is the JSON string for
 * POST/PUT/PATCH requests and an empty string for GET/DELETE requests."
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import axios from 'axios'
import { StarkBankClient } from '../../../../../../src/verticals/payments/adapters/stark-bank/client'
import { StarkBankAdapter } from '../../../../../../src/verticals/payments/adapters/stark-bank'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' })
const PEM = privateKey.export({ type: 'sec1', format: 'pem' }).toString()

interface Seen {
  url: string
  method: string
  headers: Record<string, string>
  data?: string
  params?: Record<string, unknown>
}

const original = axios.defaults.adapter
afterEach(() => {
  axios.defaults.adapter = original
})

function record(): Seen[] {
  const seen: Seen[] = []
  axios.defaults.adapter = async (config) => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(config.headers?.toJSON?.() ?? {})) headers[k] = String(v)
    seen.push({
      url: axios.getUri(config),
      method: String(config.method),
      headers,
      data: config.data as string | undefined,
      params: config.params as Record<string, unknown> | undefined,
    })
    return {
      data: { cursor: null, invoices: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  return seen
}

function verifies(message: string, signature: string): boolean {
  const v = createVerify('SHA256')
  v.update(message)
  v.end()
  return v.verify(publicKey, Buffer.from(signature, 'base64'))
}

describe('StarkBankClient', () => {
  it('sends GETs to the production /v2 host, signed over an empty body', async () => {
    const seen = record()
    const client = new StarkBankClient({
      accessToken: PEM,
      extra: { projectId: '5656565656565656' },
    })
    await client.get('/invoice', { limit: 10 })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('https://api.starkbank.com/v2/invoice?limit=10')
    const h = seen[0].headers
    expect(h['Access-Id']).toBe('project/5656565656565656')
    expect(h['Access-Time']).toMatch(/^\d{10}$/)
    expect(h['Authorization']).toBeUndefined()
    expect(verifies(`project/5656565656565656:${h['Access-Time']}:`, h['Access-Signature'])).toBe(
      true,
    )
  })

  it('signs a POST over the exact JSON string it sends', async () => {
    const seen = record()
    const client = new StarkBankClient({ accessToken: PEM, extra: { projectId: '1' } })
    await client.post('/refunds', { amount: 1 })
    const h = seen[0].headers
    expect(seen[0].data).toBe('{"amount":1}')
    expect(verifies(`project/1:${h['Access-Time']}:{"amount":1}`, h['Access-Signature'])).toBe(true)
  })

  it('accepts a PEM pasted with literal \\n escapes', async () => {
    const seen = record()
    const flat = PEM.trim().replace(/\n/g, '\\n')
    const client = new StarkBankClient({ accessToken: flat, extra: { projectId: '1' } })
    await client.get('/transfer')
    const h = seen[0].headers
    expect(verifies(`project/1:${h['Access-Time']}:`, h['Access-Signature'])).toBe(true)
  })
})

describe('StarkBankAdapter credentials', () => {
  const adapter = new StarkBankAdapter()

  it('asks for the project id and the private key', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['projectId', true],
      ['apiKey', true],
    ])
  })

  it('stores the key as the token and the project id in extra', async () => {
    const creds = await adapter.exchangeCredentials({ apiKey: PEM, projectId: ' 42 ' })
    expect(creds).toEqual({ accessToken: PEM.trim(), extra: { projectId: '42' } })
  })

  it('refuses to build credentials without a project id', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: PEM })).rejects.toThrow(/project id/)
  })
})
