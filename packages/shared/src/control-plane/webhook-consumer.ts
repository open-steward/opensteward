/**
 * Inbound webhook consumer — the in-process sink for verified platform events.
 *
 * For each event the unified router resolves to a connection, the consumer:
 *   (c) appends it to the canonical `inbound_events` stream (idempotent — this
 *       is also the dedup ledger);
 *   (a) bridges it to the OUTBOUND system as a `platform.event`, so subscribed
 *       customers receive the platform notification; and
 *   (b) best-effort refreshes the data-store cache for the affected resource
 *       (via an injected callback the server wires from the adapter registry).
 *
 * (c) is awaited first and claims the dedup key; (a) and (b) only run on the
 * first sighting and never throw out of `consume` (logged, not fatal) so a
 * webhook is acknowledged 200 as soon as it is durably recorded.
 */
import { createHash } from 'crypto'
import type { CredentialStore } from '../auth/store'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import type { InboundEventStore } from './inbound-event-store'
import { emitTenantEvent, type PlatformEventBody } from './event-emitter'

export interface InboundConsumeEvent {
  /** Platform-native event type, e.g. `charge.succeeded`. */
  type: string
  resourceType: string
  action: string
  resourceId: string
  /** Provider delivery/event id, when the parser surfaced one (best dedup key). */
  id?: string
  payload?: unknown
}

export interface InboundConsumeInput {
  vertical: string
  platform: string
  connectionId: string
  event: InboundConsumeEvent
  /** Raw verified body — used to hash a dedup key when no provider id exists. */
  rawBody: Buffer
  /**
   * `false` when the platform's proof authenticated the sender but not the
   * body (Zoho Desk's X-ZDesk-JWT). The event's type, action and ids are then
   * hints to re-read, not facts. Absent means the body was verified.
   */
  bodyAuthenticated?: false
}

/** Best-effort cache refresh, injected by the server (owns registry + token
 *  refreshers + per-vertical get-method maps). Omitted in passthrough mode. */
export type RefreshResourceFn = (input: {
  vertical: string
  platform: string
  connectionId: string
  tenantId: string | null
  resourceType: string
  resourceId: string
  action: string
  payload: unknown
  /** `false` when the body was not covered by the proof: never delete on it. */
  bodyAuthenticated?: false
}) => Promise<void>

export interface WebhookConsumerDeps {
  store: CredentialStore
  subs: WebhookSubscriptionStore
  deliveries: WebhookDeliveryStore
  inboundEvents: InboundEventStore
  refreshResource?: RefreshResourceFn
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }
}

export interface WebhookConsumer {
  consume(input: InboundConsumeInput): Promise<void>
}

export function createWebhookConsumer(deps: WebhookConsumerDeps): WebhookConsumer {
  const log = deps.logger
  return {
    async consume(input) {
      const { vertical, platform, connectionId, event, rawBody } = input
      try {
        // Owner tenant comes from the CONNECTION, never the (untrusted) event.
        const row = await deps.store.getRow(connectionId)
        const tenantId = row?.ownerTenantId ?? row?.tenantId ?? null

        // An unauthenticated body (Zoho Desk's X-ZDesk-JWT signs the sender,
        // not the body) cannot be allowed to pick its own dedup identity: a
        // forged event reusing a real event's id would make the genuine
        // delivery look like a duplicate. Binding the raw bytes in keeps exact
        // redeliveries deduplicated while a different body gets its own key.
        const providerId =
          input.bodyAuthenticated === false
            ? `${event.id}:${sha256(rawBody)}`
            : event.id || sha256(rawBody)
        const dedupKey = [
          vertical,
          platform,
          connectionId,
          providerId,
          event.resourceType,
          event.resourceId,
          event.action,
        ].join(':')

        const receivedAt = Date.now()
        const { inserted } = await deps.inboundEvents.append({
          dedupKey,
          tenantId,
          vertical,
          platform,
          connectionId,
          eventType: event.type,
          resourceType: event.resourceType,
          action: event.action,
          resourceId: event.resourceId,
          payload: event.payload ?? null,
          receivedAt,
        })
        if (!inserted) return // duplicate delivery — side effects already fired

        // (a) Bridge to the outbound system. Best-effort + durably queued.
        if (tenantId) {
          const body: PlatformEventBody = {
            vertical,
            platform,
            connection_id: connectionId,
            event_type: event.type,
            resource_type: event.resourceType,
            action: event.action,
            resource_id: event.resourceId,
            payload: event.payload ?? null,
            received_at: receivedAt,
          }
          void emitTenantEvent(deps.subs, tenantId, 'platform.event', body, {
            deliveries: deps.deliveries,
          }).catch((err) => log?.warn({ vertical, platform, err }, 'platform.event emit failed'))
        }

        // (b) Refresh the data-store cache (best-effort; server-injected).
        if (deps.refreshResource) {
          void deps
            .refreshResource({
              vertical,
              platform,
              connectionId,
              tenantId,
              resourceType: event.resourceType,
              resourceId: event.resourceId,
              action: event.action,
              payload: event.payload ?? null,
              ...(input.bodyAuthenticated === false ? { bodyAuthenticated: false as const } : {}),
            })
            .catch((err) => log?.warn({ vertical, platform, err }, 'webhook cache refresh failed'))
        }
      } catch (err) {
        log?.warn(
          { vertical: input.vertical, platform: input.platform, err },
          'webhook consume failed',
        )
      }
    },
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}
