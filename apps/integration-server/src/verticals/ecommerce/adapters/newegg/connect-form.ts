/**
 * Connect Link form for Newegg Marketplace.
 *
 * Newegg authenticates every call with three per-seller values
 * (developer.newegg.com → Registration and Authentication):
 *
 *   Authorization: {API key}
 *   SecretKey:     {secret key — must belong to the seller ID}
 *   ?sellerid=     {seller ID}
 *
 * and the base path depends on the marketplace the seller is on
 * (US `/marketplace/`, Canada `/marketplace/can/`, B2B `/marketplace/b2b/`).
 * The host itself is fixed, so the marketplace is a closed-set choice rather
 * than a free-form URL.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { MARKETPLACE_BASE_PATHS, type NeweggMarketplace } from './constants'

const MARKETPLACES = Object.keys(MARKETPLACE_BASE_PATHS) as NeweggMarketplace[]

function isMarketplace(value: string): value is NeweggMarketplace {
  return (MARKETPLACES as string[]).includes(value)
}

export const NEWEGG_FORM = customForm({
  fields: [
    {
      name: 'sellerId',
      label: 'Seller ID',
      type: 'text',
      required: true,
      placeholder: 'A001',
      helpText: 'Your Newegg Seller ID, shown in the Newegg Seller Portal next to your seller name.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'The API key Newegg issued when your Marketplace API access was approved (sent as the Authorization header). Request access through the Newegg Seller Portal or datafeeds@newegg.com.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText:
        'The secret key issued with the API key. It must belong to the Seller ID above (sent as the SecretKey header).',
    },
    {
      name: 'marketplace',
      label: 'Marketplace',
      type: 'select',
      required: true,
      helpText: 'The Newegg marketplace this seller account sells on.',
      options: [
        { value: 'us', label: 'Newegg.com (US)' },
        { value: 'can', label: 'Newegg.ca (Canada)' },
        { value: 'b2b', label: 'NeweggBusiness.com (B2B)' },
      ],
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const sellerId = (fields['sellerId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    const secretKey = (fields['secretKey'] ?? '').trim()
    const marketplace = (fields['marketplace'] ?? '').trim().toLowerCase()

    if (!sellerId) throw new Error('Seller ID is required.')
    if (!apiKey) throw new Error('API key is required.')
    if (!secretKey) throw new Error('Secret key is required.')
    if (!marketplace) throw new Error('Marketplace is required.')
    if (!isMarketplace(marketplace)) {
      throw new Error(`Marketplace must be one of: ${MARKETPLACES.join(', ')}.`)
    }
    // The seller ID is interpolated into request query strings.
    if (!/^[A-Za-z0-9]+$/.test(sellerId)) {
      throw new Error('Seller ID may only contain letters and digits.')
    }

    return {
      accessToken: secretKey,
      extra: { sellerId, apiKey, marketplace },
    }
  },
})
