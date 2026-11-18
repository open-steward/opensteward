/**
 * Yellow.ai authentication — API key, sent in the documented `x-api-key` header
 * ("Pass the API key in the header as x-api-key.",
 * https://docs.yellow.ai/docs/platform_concepts/get_started/api-keys).
 *
 * Only Admins and Super Admins of a bot can create API keys.
 * Generate under: Settings > API Keys.
 *
 * The bot ID (botId) and region code are also required at call time and
 * are stored in credentials.extra.
 *
 * Docs: https://docs.yellow.ai/api/introduction
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { DEFAULT_REGION } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('yellow-ai uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Your Yellow.ai API key. Generate it under Settings > API Keys. Only Admins / Super Admins can create keys.',
    },
    {
      name: 'botId',
      label: 'Bot ID',
      type: 'text',
      required: true,
      helpText:
        'The unique identifier of your Yellow.ai bot (visible in the bot URL on cloud.yellow.ai).',
    },
    {
      name: 'region',
      label: 'Region',
      type: 'text',
      required: false,
      helpText:
        "Region code of your bot's server: leave blank for India (cloud.yellow.ai); r1 = MEA, r2 = Indonesia, r3 = Singapore, r4 = USA, r5 = Europe.",
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('yellow-ai credentialFields require apiKey')
  const botId = fields['botId']
  if (!botId) throw new Error('yellow-ai credentialFields require botId')
  const region = fields['region'] || DEFAULT_REGION
  return {
    accessToken: apiKey,
    extra: { botId, region },
  }
}
