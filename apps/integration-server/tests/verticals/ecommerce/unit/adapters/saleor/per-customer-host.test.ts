/**
 * Every Saleor store has its own GraphQL endpoint (`https://{store}.saleor.cloud/graphql/`
 * or a self-hosted `/graphql/`). The client reads it from
 * `credentials.extra.apiUrl` and scopes prices by `extra.channelSlug`. The
 * Connect Link form must collect them with the App token and only accept a
 * public https host.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { SaleorAdapter } from '../../../../../../src/verticals/ecommerce/adapters/saleor'
import { SaleorClient } from '../../../../../../src/verticals/ecommerce/adapters/saleor/client'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '169.254.169.254' }]

function clientState(client: SaleorClient): { apiUrl: string; token: string } {
  return client as unknown as { apiUrl: string; token: string }
}

describe('Saleor Connect Link form', () => {
  const adapter = new SaleorAdapter({ apiUrl: '', appToken: '' })

  beforeEach(() => {
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    setDnsResolver(PUBLIC_DNS)
  })
  afterEach(() => setDnsResolver(undefined))

  it('declares the GraphQL API URL, App token and optional channel slug', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['apiUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['apiUrl']?.placeholder).toMatch(/^https:\/\//)
    expect(byName['apiUrl']?.helpText).toBeTruthy()
    expect(byName['accessToken']).toMatchObject({ type: 'password', required: true })
    expect(byName['accessToken']?.helpText).toBeTruthy()
    expect(byName['channelSlug']).toMatchObject({ type: 'text', required: false })
    expect(byName['channelSlug']?.helpText).toBeTruthy()
  })

  it('rejects a blank GraphQL API URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: ' ', accessToken: 'tok' }),
    ).rejects.toThrow('GraphQL API URL is required.')
  })

  it('rejects a blank App token', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://store.saleor.cloud/graphql/', accessToken: '' }),
    ).rejects.toThrow('App token is required.')
  })

  it('rejects a value that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'store saleor cloud', accessToken: 'tok' }),
    ).rejects.toThrow('GraphQL API URL must be a full URL')
  })

  it('rejects a non-https URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'http://store.saleor.cloud/graphql/', accessToken: 'tok' }),
    ).rejects.toThrow('GraphQL API URL must start with https://')
  })

  it('rejects a host name that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://metadata.example/graphql/', accessToken: 'tok' }),
    ).rejects.toThrow(
      'GraphQL API URL must be a publicly reachable host; metadata.example resolves to a private or reserved address.',
    )
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://192.168.0.10/graphql/', accessToken: 'tok' }),
    ).rejects.toThrow(
      'GraphQL API URL must be a publicly reachable host; 192.168.0.10 resolves to a private or reserved address.',
    )
  })

  it.each([
    ['https://store.saleor.cloud', 'https://store.saleor.cloud/graphql/'],
    ['https://store.saleor.cloud/graphql', 'https://store.saleor.cloud/graphql/'],
    [' https://store.saleor.cloud/graphql/ ', 'https://store.saleor.cloud/graphql/'],
  ])('normalises %j to the /graphql/ endpoint', async (input, expected) => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: input, accessToken: ' tok ' }),
    ).resolves.toEqual({ accessToken: 'tok', extra: { apiUrl: expected } })
  })

  it('stores the channel slug when given', async () => {
    const creds = await adapter.exchangeCredentials({
      apiUrl: 'https://store.saleor.cloud/graphql/',
      accessToken: 'tok',
      channelSlug: ' uk-store ',
    })
    expect(creds.extra).toEqual({
      apiUrl: 'https://store.saleor.cloud/graphql/',
      channelSlug: 'uk-store',
    })
  })

  it('builds the client from the collected credentials', async () => {
    const creds = await adapter.exchangeCredentials({
      apiUrl: 'https://store.saleor.cloud/graphql/',
      accessToken: 'tok',
    })
    expect(clientState(new SaleorClient(creds))).toMatchObject({
      apiUrl: 'https://store.saleor.cloud/graphql/',
      token: 'tok',
    })
  })
})
