/**
 * InvoiceXpress serves every account from `{account}.app.invoicexpress.com`,
 * so the Connect Link form must collect the account name alongside the API
 * key, and the adapter must use the credentials it is handed — not a
 * deployment-level config the admin UI never fills in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { InvoiceXpressAdapter } from '../../../../../../src/verticals/accounting/adapters/invoicexpress'

const HALT = 'request-captured'

interface Captured {
  created: Array<Record<string, unknown>>
  requests: Array<{ path: unknown; options: unknown }>
}

function captureAxios(): Captured {
  const captured: Captured = { created: [], requests: [] }
  const halt = async (path: unknown, options: unknown): Promise<never> => {
    captured.requests.push({ path, options })
    throw new Error(HALT)
  }
  vi.spyOn(axios, 'create').mockImplementation(((config: Record<string, unknown>) => {
    captured.created.push(config)
    return { get: halt, post: halt, put: halt, delete: halt }
  }) as unknown as typeof axios.create)
  return captured
}

// The factory hands adapters whatever deployment config exists — for a
// Connect Link tenant that is nothing.
const unconfigured = (): InvoiceXpressAdapter =>
  new InvoiceXpressAdapter({} as ConstructorParameters<typeof InvoiceXpressAdapter>[0])

afterEach(() => {
  vi.restoreAllMocks()
})

describe('InvoiceXpress Connect Link form', () => {
  it('collects the API key and the account name', () => {
    const fields = unconfigured().credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['accountName', 'apiKey'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['accountName']).toMatchObject({ type: 'text', required: true })
    expect(byName['accountName']?.helpText).toMatch(/app\.invoicexpress\.com/)
  })

  it('rejects a blank API key', async () => {
    await expect(
      unconfigured().exchangeCredentials({ apiKey: '', accountName: 'mycompany' }),
    ).rejects.toThrow(/InvoiceXpress API key is required/)
  })

  it('rejects a blank account name', async () => {
    await expect(
      unconfigured().exchangeCredentials({ apiKey: 'ix-key', accountName: '   ' }),
    ).rejects.toThrow(/InvoiceXpress account name is required/)
  })

  it.each([
    'mycompany.app.invoicexpress.com.evil.example',
    'https://mycompany.app.invoicexpress.com.evil.example/',
    'evil.example',
    'mycompany.invoicexpress.com',
    'mycompany.app.invoicexpress.com@evil.example',
    'mycompany.app.invoicexpress.com:444',
    'a.b.app.invoicexpress.com',
  ])('rejects %s as not an app.invoicexpress.com address', async (accountName) => {
    await expect(
      unconfigured().exchangeCredentials({ apiKey: 'ix-key', accountName }),
    ).rejects.toThrow(/must be on app\.invoicexpress\.com/)
  })

  it('rejects a non-https address', async () => {
    await expect(
      unconfigured().exchangeCredentials({
        apiKey: 'ix-key',
        accountName: 'http://mycompany.app.invoicexpress.com',
      }),
    ).rejects.toThrow(/must use https/)
  })

  it('rejects an account name with invalid characters', async () => {
    await expect(
      unconfigured().exchangeCredentials({ apiKey: 'ix-key', accountName: 'my company' }),
    ).rejects.toThrow(/letters, digits and hyphens/)
  })

  it.each([
    ['mycompany', 'mycompany'],
    ['  MyCompany ', 'mycompany'],
    ['mycompany.app.invoicexpress.com', 'mycompany'],
    ['https://MyCompany.app.invoicexpress.com/documents?page=2', 'mycompany'],
  ])('normalises %s to account name %s', async (accountName, expected) => {
    const creds = await unconfigured().exchangeCredentials({ apiKey: ' ix-key ', accountName })
    expect(creds).toEqual({ accessToken: 'ix-key', extra: { accountName: expected } })
  })
})

describe('InvoiceXpress client host', () => {
  it('calls the account host and API key from the credentials it is handed', async () => {
    const captured = captureAxios()
    const creds: Credentials = { accessToken: 'ix-key', extra: { accountName: 'mycompany' } }
    await expect(unconfigured().listInvoices(creds, {})).rejects.toThrow(HALT)
    expect(captured.created[0]?.['baseURL']).toBe('https://mycompany.app.invoicexpress.com/')
    expect(captured.requests[0]?.options).toMatchObject({ params: { api_key: 'ix-key' } })
  })

  it('prefers the connection credentials over deployment config', async () => {
    const captured = captureAxios()
    const adapter = new InvoiceXpressAdapter({ apiKey: 'deploy-key', accountName: 'deploy' })
    const creds: Credentials = { accessToken: 'ix-key', extra: { accountName: 'mycompany' } }
    await expect(adapter.getOrganization(creds)).rejects.toThrow(HALT)
    expect(captured.created[0]?.['baseURL']).toBe('https://mycompany.app.invoicexpress.com/')
    expect(captured.requests[0]?.options).toMatchObject({ params: { api_key: 'ix-key' } })
  })

  it('refuses a stored account name that is not a single DNS label', async () => {
    const captured = captureAxios()
    const creds: Credentials = { accessToken: 'ix-key', extra: { accountName: 'evil.example/#' } }
    await expect(unconfigured().listInvoices(creds, {})).rejects.toThrow(
      /InvoiceXpress connection is missing its account name/,
    )
    expect(captured.created).toHaveLength(0)
  })
})
