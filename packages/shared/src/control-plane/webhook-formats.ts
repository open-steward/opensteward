/**
 * Destination formats for outbound webhook deliveries.
 *
 * A subscription's `format` decides the exact bytes POSTed to its URL — and
 * therefore the bytes the HMAC signature covers. `opensteward` is the
 * default: the raw event envelope, serialized as-is; the other three exist
 * because a receiver you do not control dictates its own shape:
 *
 *   - `slack` — Slack incoming webhooks answer anything that is not
 *     `{text}`/`{blocks}` with `400 invalid_payload`.
 *   - `teams` — an Adaptive Card inside a `message` attachment, which is what
 *     a Teams Workflows (Power Automate) URL consumes. Deliberately not the
 *     legacy `MessageCard`: Office 365 connectors in Teams were retired.
 *   - `flat` — one level of dotted keys, for tools that can only map
 *     top-level fields (Slack Workflow Builder, Zapier, some SIEMs).
 *
 * Everything here is pure: no I/O, no clock, no randomness, so a delivery's
 * body is a function of its envelope alone and can be replayed exactly.
 *
 * Rendering is defensive by necessity. Only 5 of the 12 event types have a
 * declared body interface, and `resource.synced` emits two different shapes
 * depending on whether the sync worker batches. Every field access here
 * treats `envelope.data` as unknown and degrades to a generic summary rather
 * than throwing — a renderer that crashes takes the delivery with it.
 */
import type { EventEnvelope } from './event-emitter'

export const WEBHOOK_FORMATS = ['opensteward', 'slack', 'teams', 'flat'] as const
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number]

export const DEFAULT_WEBHOOK_FORMAT: WebhookFormat = 'opensteward'

/**
 * Type of the synthetic envelope sent by "send a test event". Deliberately
 * NOT a member of `TenantEvent`: nothing emits it, and it must never appear
 * in a subscription's event filter or an event picker. It exists so an
 * operator can prove a destination works without creating real data.
 */
export const TEST_EVENT_TYPE = 'opensteward.test'

export function isWebhookFormat(value: unknown): value is WebhookFormat {
  return typeof value === 'string' && (WEBHOOK_FORMATS as readonly string[]).includes(value)
}

export interface RenderContext {
  /**
   * Turns a platform slug into its display name. The catalogue lives in
   * integration-server's per-vertical `platforms/metadata.ts`, which this
   * package cannot import, so the resolver is injected. Unwired, renderers
   * print the slug — less pretty, never wrong.
   */
  resolvePlatformName?: (slug: string) => string | undefined
}

/** Slack's own limits. Exceeding them fails the whole message, not the field. */
const SLACK_TEXT_LIMIT = 3000
const SLACK_FIELD_LIMIT = 2000
const SLACK_MAX_FIELDS = 10
const FLAT_MAX_DEPTH = 3
const FLAT_VALUE_LIMIT = 500

type Fields = Array<[string, string]>

interface Summary {
  /** One line an operator can read in a notification list. */
  title: string
  /** What to do about it, when the event implies an action. */
  guidance?: string
  fields: Fields
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/** Human-readable event name: `connect_link.consumed` → `Connect link consumed`. */
function humanizeType(type: string): string {
  const words = type.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function platformName(slug: unknown, ctx: RenderContext): string | undefined {
  const raw = str(slug)
  if (!raw) return undefined
  return ctx.resolvePlatformName?.(raw) ?? raw
}

/** Describes a connection the way the admin UI does: label first, id as fallback. */
function connectionName(data: Record<string, unknown>): string | undefined {
  const label = str(data.label)
  if (label) return label
  const id = str(data.connection_id) ?? str(data.id)
  return id ? id.slice(0, 8) : undefined
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

/**
 * Reduces any envelope to a title and a handful of labelled fields. Unknown
 * event types and unknown payload shapes fall through to a generic summary
 * built from whatever primitive fields the payload happens to carry.
 */
export function summarize(envelope: EventEnvelope<unknown>, ctx: RenderContext = {}): Summary {
  const data = asRecord(envelope.data)
  const platform = platformName(data.platform, ctx)
  const vertical = str(data.vertical)
  const connection = connectionName(data)

  const base: Fields = []
  if (platform) base.push(['Platform', platform])
  if (vertical) base.push(['Vertical', vertical])

  // Checked as a string before the switch: the test type is not part of the
  // TenantEvent union, and must read unmistakably as a test so nobody treats
  // it as a real incident when it lands in a channel.
  if ((envelope.type as string) === TEST_EVENT_TYPE) {
    return {
      title: 'Test event from OpenSteward',
      guidance:
        'Your webhook subscription is configured correctly. Nothing happened in OpenSteward — an operator sent this to check the destination.',
      fields: [
        ...(str(data.subscription_id)
          ? ([['Subscription', str(data.subscription_id)!]] as Fields)
          : []),
        ...(str(data.format) ? ([['Format', str(data.format)!]] as Fields) : []),
      ],
    }
  }

  switch (envelope.type) {
    case 'connection.authorization_expired':
      return {
        title: `${platform ?? 'A connection'} needs re-authorization${connection ? ` — ${connection}` : ''}`,
        guidance:
          'The refresh token was rejected. The customer must re-authorize this connection; reconnecting from the connection page sends them through it again.',
        fields: [
          ...base,
          ...(connection ? ([['Connection', connection]] as Fields) : []),
          ...(str(data.connection_id)
            ? ([['Connection id', str(data.connection_id)!]] as Fields)
            : []),
        ],
      }

    case 'connection.platform_credentials_invalid':
      return {
        title: `${platform ?? 'A platform'} rejected the OAuth client credentials`,
        guidance:
          'This affects every connection for this platform, and customer re-authorization will not fix it. An operator must correct the client id and secret in platform settings.',
        fields: [...base, ...(connection ? ([['Connection', connection]] as Fields) : [])],
      }

    case 'connect_link.consumed': {
      const conn = asRecord(data.connection)
      const connPlatform = platformName(conn.platform, ctx) ?? platform
      return {
        title: `Connect link consumed${connPlatform ? ` — ${connPlatform}` : ''}`,
        fields: [
          ...(connPlatform ? ([['Platform', connPlatform]] as Fields) : []),
          ...(str(conn.vertical) ? ([['Vertical', str(conn.vertical)!]] as Fields) : []),
          ...(str(conn.id) ? ([['Connection id', str(conn.id)!]] as Fields) : []),
          ...(str(conn.label) ? ([['Label', str(conn.label)!]] as Fields) : []),
        ],
      }
    }

    case 'connect_link.created':
      return {
        title: 'Connect link created',
        fields: [
          ...(str(data.customerId) ? ([['Customer', str(data.customerId)!]] as Fields) : []),
          ...(str(data.label) ? ([['Label', str(data.label)!]] as Fields) : []),
          ...(str(data.url) ? ([['Link', str(data.url)!]] as Fields) : []),
        ],
      }

    case 'connect_link.disposed':
      return {
        title: `One-time connect link disposed${platform ? ` — ${platform}` : ''}`,
        guidance: 'The snapshot is final and the connection has been deleted.',
        fields: [
          ...base,
          ...(str(data.connection_id)
            ? ([['Connection id', str(data.connection_id)!]] as Fields)
            : []),
        ],
      }

    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted': {
      const who = str(data.displayName) ?? str(data.email) ?? str(data.id) ?? 'a customer'
      return {
        title: `${humanizeType(envelope.type)} — ${who}`,
        fields: [
          ...(str(data.id) ? ([['Customer id', str(data.id)!]] as Fields) : []),
          ...(str(data.email) ? ([['Email', str(data.email)!]] as Fields) : []),
          ...(str(data.externalReference)
            ? ([['External reference', str(data.externalReference)!]] as Fields)
            : []),
        ],
      }
    }

    case 'resource.synced':
    case 'resource.updated':
    case 'resource.deleted': {
      const resource = str(data.resource_type) ?? 'resource'
      // Two shapes: the per-item path carries `resource_id`, the batched path
      // carries `items[]` and no id at all.
      const items = Array.isArray(data.items) ? data.items.length : undefined
      const count = items !== undefined ? `${items} ${resource}` : resource
      return {
        title: `${humanizeType(envelope.type)} — ${count}`,
        fields: [
          ...base,
          ['Resource', resource],
          ...(items !== undefined ? ([['Items', String(items)]] as Fields) : []),
          ...(str(data.resource_id) ? ([['Resource id', str(data.resource_id)!]] as Fields) : []),
          ...(str(data.connection_id)
            ? ([['Connection id', str(data.connection_id)!]] as Fields)
            : []),
        ],
      }
    }

    case 'platform.event':
      return {
        title: `${platform ?? 'Platform'} sent ${str(data.event_type) ?? 'an event'}`,
        fields: [
          ...base,
          ...(str(data.event_type) ? ([['Event', str(data.event_type)!]] as Fields) : []),
          ...(str(data.resource_type) ? ([['Resource', str(data.resource_type)!]] as Fields) : []),
          ...(str(data.resource_id) ? ([['Resource id', str(data.resource_id)!]] as Fields) : []),
          ...(str(data.connection_id)
            ? ([['Connection id', str(data.connection_id)!]] as Fields)
            : []),
        ],
      }

    default: {
      // Unknown or untyped event: surface whatever primitives the payload has
      // rather than dropping the operator into an empty message.
      const fields: Fields = []
      for (const [key, value] of Object.entries(data)) {
        const rendered = str(value)
        if (rendered && fields.length < SLACK_MAX_FIELDS) fields.push([key, rendered])
      }
      return { title: humanizeType(envelope.type), fields }
    }
  }
}

function renderSlack(envelope: EventEnvelope<unknown>, ctx: RenderContext): string {
  const summary = summarize(envelope, ctx)
  const text = truncate(summary.title, SLACK_TEXT_LIMIT)

  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: `*${text}*` } }]

  if (summary.guidance) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(summary.guidance, SLACK_TEXT_LIMIT) },
    })
  }

  const fields = summary.fields.slice(0, SLACK_MAX_FIELDS).map(([label, value]) => ({
    type: 'mrkdwn',
    text: truncate(`*${label}*\n${value}`, SLACK_FIELD_LIMIT),
  }))
  if (fields.length > 0) blocks.push({ type: 'section', fields })

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: truncate(`${envelope.type} · \`${envelope.id}\``, SLACK_FIELD_LIMIT),
      },
    ],
  })

  return JSON.stringify({ text, blocks })
}

function renderTeams(envelope: EventEnvelope<unknown>, ctx: RenderContext): string {
  const summary = summarize(envelope, ctx)

  const body: unknown[] = [
    { type: 'TextBlock', text: summary.title, weight: 'Bolder', size: 'Medium', wrap: true },
  ]
  if (summary.guidance) {
    body.push({ type: 'TextBlock', text: summary.guidance, wrap: true, isSubtle: true })
  }
  if (summary.fields.length > 0) {
    body.push({
      type: 'FactSet',
      facts: summary.fields.map(([title, value]) => ({ title, value })),
    })
  }
  body.push({
    type: 'TextBlock',
    text: `${envelope.type} · ${envelope.id}`,
    wrap: true,
    isSubtle: true,
    spacing: 'Small',
    size: 'Small',
  })

  return JSON.stringify({
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.5',
          body,
        },
      },
    ],
  })
}

/** Flattens one value into dotted keys, capping depth and value length. */
function flatten(
  value: unknown,
  prefix: string,
  out: Record<string, unknown>,
  depth: number,
): void {
  if (value === null || value === undefined) {
    out[prefix] = null
    return
  }
  if (typeof value === 'string') {
    out[prefix] = truncate(value, FLAT_VALUE_LIMIT)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out[prefix] = value
    return
  }
  if (Array.isArray(value)) {
    // Length, not contents: an inlined array defeats the point of flattening.
    out[`${prefix}.count`] = value.length
    return
  }
  if (depth >= FLAT_MAX_DEPTH) {
    out[prefix] = truncate(JSON.stringify(value) ?? '', FLAT_VALUE_LIMIT)
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    flatten(nested, `${prefix}.${key}`, out, depth + 1)
  }
}

function renderFlat(envelope: EventEnvelope<unknown>): string {
  const out: Record<string, unknown> = {
    event: envelope.type,
    event_id: envelope.id,
    version: envelope.version,
    created_at: envelope.created_at,
  }
  flatten(envelope.data, 'data', out, 0)
  return JSON.stringify(out)
}

/**
 * Renders the exact bytes to POST for a subscription's format. The result is
 * also what gets signed, so every format stays verifiable by a receiver that
 * chooses to check `x-oi-signature`.
 */
export function renderPayload(
  format: WebhookFormat,
  envelope: EventEnvelope<unknown>,
  ctx: RenderContext = {},
): string {
  switch (format) {
    case 'opensteward':
      return JSON.stringify(envelope)
    case 'slack':
      return renderSlack(envelope, ctx)
    case 'teams':
      return renderTeams(envelope, ctx)
    case 'flat':
      return renderFlat(envelope)
    default:
      // Reaching here means the store holds a format the renderer does not
      // know — a schema/validator mismatch. Failing loudly beats silently
      // sending a shape the receiver rejects.
      throw new Error(`unknown webhook format: ${String(format)}`)
  }
}
