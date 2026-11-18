/**
 * Flowmono auth helpers — API credentials form only.
 *
 * Flowmono does not expose an OAuth Authorization-Code flow for
 * server-to-server integrations. Backend access uses a Bearer token
 * (Authorization header) together with the appId, apiClientId, subscriberId,
 * and userId that identify the application/tenant context.
 *
 * The Connect Link credential form collects these values; the adapter stores
 * them on `credentials.extra` so the client can inject them into every
 * request body.
 *
 * Docs: https://www.flowmono.com/en-US/api/e-sign
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const FORM = customForm({
  fields: [
    {
      name: 'token',
      label: 'Bearer token',
      type: 'password',
      placeholder: 'Your Flowmono API token',
      helpText:
        'In Flowmono, open Settings → API and copy the access token. The adapter sends it as the Authorization: Bearer header.',
      required: true,
    },
    {
      name: 'appId',
      label: 'App ID',
      type: 'text',
      placeholder: 'Your Flowmono App ID',
      helpText: 'The unique identifier for your registered Flowmono application.',
      required: true,
    },
    {
      name: 'apiClientId',
      label: 'API Client ID',
      type: 'text',
      placeholder: 'Your Flowmono API Client ID',
      helpText: 'The client identifier issued when you registered your application with Flowmono.',
      required: true,
    },
    {
      name: 'subscriberId',
      label: 'Subscriber ID',
      type: 'text',
      placeholder: 'Your Flowmono Subscriber ID',
      helpText: 'The numeric ID of your Flowmono organisation/tenant.',
      required: true,
    },
    {
      name: 'userId',
      label: 'User ID',
      type: 'text',
      placeholder: 'Your Flowmono User ID',
      helpText: 'The ID of the Flowmono user on whose behalf the adapter acts.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const token = (fields.token ?? '').trim()
    if (!token) throw new Error('Flowmono Bearer token is required.')
    const appId = (fields.appId ?? '').trim()
    if (!appId) throw new Error('Flowmono App ID is required.')
    const apiClientId = (fields.apiClientId ?? '').trim()
    if (!apiClientId) throw new Error('Flowmono API Client ID is required.')
    const subscriberIdRaw = (fields.subscriberId ?? '').trim()
    const subscriberId = Number(subscriberIdRaw)
    if (!subscriberIdRaw || Number.isNaN(subscriberId)) {
      throw new Error('Flowmono Subscriber ID must be a number.')
    }
    const userId = (fields.userId ?? '').trim()
    if (!userId) throw new Error('Flowmono User ID is required.')
    return {
      accessToken: token,
      extra: { appId, apiClientId, subscriberId, userId },
    }
  },
})
