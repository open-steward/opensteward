/**
 * Daftra serves every tenant from its own subdomain (`{subdomain}.daftra.com/api2/`),
 * so the Connect Link form must collect that subdomain alongside the API key,
 * and the client must build its base URL from the stored credentials — not from
 * a deployment-level config the admin UI never fills in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DaftraAdapter } from '../../../../../../src/verticals/accounting/adapters/daftra'

const HALT = 'request-captured'

function captureAxios(): { created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = []
  const halt = async (): Promise<never> => {
    throw new Error(HALT)
  }
  vi.spyOn(axios, 'create').mockImplementation(((config: Record<string, unknown>) => {
    created.push(config)
    return { get: halt, post: halt, put: halt, delete: halt }
  }) as unknown as typeof axios.create)
  return { created }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Daftra Connect Link form', () => {
  it('collects the API key and the tenant subdomain', () => {
    const fields = new DaftraAdapter().credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'subdomain'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['subdomain']).toMatchObject({ type: 'text', required: true })
    expect(byName['subdomain']?.helpText).toMatch(/daftra\.com/)
  })

  it('rejects a blank API key', async () => {
    await expect(
      new DaftraAdapter().exchangeCredentials({ apiKey: '  ', subdomain: 'acme' }),
    ).rejects.toThrow(/Daftra API key is required/)
  })

  it('rejects a blank subdomain', async () => {
    await expect(
      new DaftraAdapter().exchangeCredentials({ apiKey: 'key-123', subdomain: ' ' }),
    ).rejects.toThrow(/Daftra subdomain is required/)
  })

  it.each([
    'acme.daftra.com.evil.example',
    'https://acme.daftra.com.evil.example/',
    'evil.example',
    'acme.daftra.com@evil.example',
    'acme.daftra.com:8443',
    'a.b.daftra.com',
  ])('rejects %s as not a daftra.com address', async (subdomain) => {
    await expect(
      new DaftraAdapter().exchangeCredentials({ apiKey: 'key-123', subdomain }),
    ).rejects.toThrow(/must be on daftra\.com/)
  })

  it('rejects a non-https address', async () => {
    await expect(
      new DaftraAdapter().exchangeCredentials({ apiKey: 'key-123', subdomain: 'http://acme.daftra.com' }),
    ).rejects.toThrow(/must use https/)
  })

  it('rejects a subdomain with invalid characters', async () => {
    await expect(
      new DaftraAdapter().exchangeCredentials({ apiKey: 'key-123', subdomain: 'my_company!' }),
    ).rejects.toThrow(/letters, digits and hyphens/)
  })

  it.each([
    ['acme', 'acme'],
    ['  ACME  ', 'acme'],
    ['acme.daftra.com', 'acme'],
    ['https://Acme.Daftra.com/owner/dashboard?x=1', 'acme'],
    ['my-shop-2', 'my-shop-2'],
  ])('normalises %s to subdomain %s', async (subdomain, expected) => {
    const creds = await new DaftraAdapter().exchangeCredentials({ apiKey: ' key-123 ', subdomain })
    expect(creds).toEqual({ accessToken: 'key-123', extra: { subdomain: expected } })
  })
})

describe('Daftra client host', () => {
  it('builds the base URL from the subdomain stored on the credentials', async () => {
    const { created } = captureAxios()
    const creds: Credentials = { accessToken: 'key-123', extra: { subdomain: 'acme' } }
    await expect(new DaftraAdapter().listInvoices(creds, {})).rejects.toThrow(HALT)
    expect(created).toHaveLength(1)
    expect(created[0]?.['baseURL']).toBe('https://acme.daftra.com/api2/')
  })

  it('prefers the credentials subdomain over a deployment-level fallback', async () => {
    const { created } = captureAxios()
    const creds: Credentials = { accessToken: 'key-123', extra: { subdomain: 'acme' } }
    await expect(new DaftraAdapter({ subdomain: 'deployment' }).listInvoices(creds, {})).rejects.toThrow(HALT)
    expect(created[0]?.['baseURL']).toBe('https://acme.daftra.com/api2/')
  })

  it('refuses to call a hostless URL when no subdomain is known', async () => {
    const { created } = captureAxios()
    await expect(new DaftraAdapter().listInvoices({ accessToken: 'key-123' }, {})).rejects.toThrow(
      /Daftra connection is missing its subdomain/,
    )
    expect(created).toHaveLength(0)
  })

  it('refuses a stored subdomain that is not a single DNS label', async () => {
    const { created } = captureAxios()
    const creds: Credentials = { accessToken: 'key-123', extra: { subdomain: 'evil.example/#' } }
    await expect(new DaftraAdapter().listInvoices(creds, {})).rejects.toThrow(
      /Daftra connection is missing its subdomain/,
    )
    expect(created).toHaveLength(0)
  })
})
