# Erasing an end user's data

The runbook for a deletion / right-to-erasure request concerning one of your
tenant's customers (an *end user* — the person who clicked a Connect Link).
Store by store, in the order that leaves nothing orphaned. *Not legal advice;
what your obligations are is between you, your counsel and your regulator —
this page is about what the software holds and how to remove it.*

## Where an end user's data can live

| Store | What it holds | Removed by |
|---|---|---|
| `end_users` | Email, display name, encrypted PII blob (name / phone / address / personal ID) | Step 1 |
| `credentials` (connections) | Encrypted OAuth tokens for their platform accounts | Step 1 with cascade |
| `resources` (data-store cache) | Synced business records from their platforms | Connection-delete cascade (automatic) |
| `resource_tombstones` | One row per deletion: vertical, platform, connection id, resource type and id, time. No record contents | Kept: it is the delete feed destinations read |
| Read-only SQL views (`os_analytics*`, Postgres) | Views over `resources`, not copies | Nothing to do: they reflect a deletion as soon as it commits |
| Native dashboards | Aggregates over `resources` | Nothing to do: cached for at most 60 s |
| Embedded Superset | Query results in Superset's cache; charts and datasets hold no rows | Ages out with Superset's cache (5 minutes in the shipped config) |
| Destinations: Postgres, Snowflake, BigQuery, Databricks | Exported copies of records | Applied automatically from the tombstones on the destination's next run — see [Destinations](#destinations) |
| Destinations: Parquet files (S3, GCS, Azure) and Iceberg tables | Exported copies of records, in files | **Not removed by OpenSteward** — see [Destinations](#destinations) |
| `sync_jobs` | Connection id + sync progress | Connection-delete cascade (automatic) |
| `connection_external_accounts` | Platform account ↔ connection mapping | Connection-delete cascade (automatic) |
| `connect_sessions` | Link label, expiry, consumed-at; end-user FK | Detached (nulled) automatically at step 1 — the session row itself is your audit trail and carries no PII |
| `end_user_tokens` (`eut_…`) | Their MCP token hashes | Step 2 |
| `webhook_deliveries.body` | Outbound event JSON — can embed their email and connection detail | Step 3 (retention) or manual |
| `inbound_events.payload` | Raw platform webhooks — can embed their order/customer data verbatim | Step 3 (retention) |
| Provider-side OAuth grant | Their consent, recorded at Shopify/Stripe/etc. | Step 4 — manual, **not** performed by OpenSteward |
| Your log pipeline | Structured lines (`pii_reveal`, request logs) | Step 5 — your infrastructure, out of the app's reach |

## Step 1 — delete the customer, with the connection cascade

One call removes the customer record **and** every connection their links
produced, which fires the standard connection-delete cascade: cached
resources, sync jobs and external-account links all drop with it.

```sh
# Developer surface (Bearer key, scope customers:write):
curl -X DELETE -H "Authorization: Bearer $KEY" \
  "$BASE/v1/customers/<id>?cascade=connections"

# Operator surface (X-Admin-Secret):
curl -X DELETE -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$BASE/admin/end-users/<id>?cascade=connections"
```

Without `?cascade=connections`, **only** the `end_users` row is removed
and every connection stays live.
That is almost never what an erasure request means.

The encrypted PII blob is hard-deleted with the row. Each connection delete
is recorded in the audit log (`connection.delete`, under the `system` user
when it originates in integration-server).

The connection delete writes a `connection`-scope tombstone into the delete
feed, which is how the removal reaches your destinations (below).

## Step 2 — revoke their MCP tokens

**Admin → Customers → *the customer* → MCP tokens → Revoke**, for any `eut_…`
token they held (or `DELETE /admin/end-user-tokens/:id`). Token rows are
hashes — nothing personal is recoverable from them — but a live token is
live access, so revoke before you consider the request closed.

## Step 3 — bound the webhook payload stores

Delivered webhook bodies and raw inbound payloads are pruned by two runtime
settings (**Admin → Settings → Webhooks**), both `0` (keep forever) until you
say otherwise:

- `webhooks.delivery_retention_days` — delivered/dead outbound bodies.
  Pending deliveries are never pruned. 30 is a sensible value.
- `webhooks.inbound_event_retention_days` — raw inbound platform payloads.

The sweep runs about every six hours. With retention configured, a deleted
customer's residue in these stores ages out on that schedule; if a request
demands immediate removal, set the value low, wait one sweep, and restore it.

## Step 4 — revoke the provider-side grant

Deleting a connection **does not call the platform** to revoke its OAuth
grant — the provider-side consent survives until the refresh token dies or
someone revokes it at the source. For a full erasure, revoke it in the
platform's own console (e.g. Shopify → Apps, Google → Security → Third-party
access), or have the end user do so. This is the one step that cannot be
automated uniformly today.

## Step 5 — your own pipelines

Anything outside the application's databases is yours to sweep: container
logs (PII reveals are logged as structured `pii_reveal` events by design),
log aggregators, backups, CSV/NDJSON exports operators downloaded from the
data viewer (each one is in the audit log as `data.export`, with who and
which connection), and whatever a BI tool connected through SQL access has
copied into its own storage. A backup taken before the erasure still contains
the data — apply your backup-retention policy accordingly
([backup-restore](../deployment/backup-restore.md)).

## Destinations

A destination holds a copy outside OpenSteward, so erasure depends on its type.
Every delete path (connection delete, record delete, a full sync finding a
record gone, an operator clearing the cache) writes a tombstone, and the next
export run forwards it. Check the destination's run history for a successful
run after the delete before you close the request; a disabled destination does
not run, and applies nothing until it is enabled again.

- **Postgres and warehouse loaders (Snowflake, BigQuery, Databricks)** apply
  the tombstones as deletes: rows covered by the tombstone whose `changed_at`
  is not after its `deleted_at`. A connection-scope tombstone removes that
  connection's rows from every table the destination has written. Your
  warehouse's time travel and fail-safe still keep earlier versions for their
  configured retention; that is part of your warehouse's erasure story, not
  OpenSteward's.
- **Parquet files in object storage, and Iceberg tables**, are immutable.
  OpenSteward never rewrites or deletes a file it has written. The tombstones
  are written to `_deletes/` (Iceberg: logged there too) so your pipeline can
  act on them, but **removing the data from files already exported is your
  responsibility**: rewrite or compact the affected partitions with your lake's
  tooling, or rely on lifecycle rules that expire old files. Files are
  partitioned by `vertical=`/`resource_type=`/`dt=`; the `connection_id`
  column identifies the rows.
- **Masked exports still count.** A destination without `includePii` masks
  names, emails and other PII, but `hmac`-masked values are pseudonymous, not
  anonymous, and free-text fields may still carry personal data.

See [destinations § Deletions](../integrate/destinations.md#deletions-tombstones)
and [§ Erasure](../integrate/destinations.md#erasure).

## Console users (your own staff)

The steps above cover your tenants' customers. A request from someone who
signs in to the admin console concerns admin-api's `admin.db` instead
(`admin_store` v7):

| Store | What it holds | Removed by |
|---|---|---|
| `users.email`, `users.email_source` | Their email address, and whether an admin set it (`manual`) or the IdP did (`idp`) | Clear it on **Admin → Users → *the user*** (or `PATCH /api/users/:id` with `"email": null`), or delete the user |
| `user_avatars` | Their profile picture, stored as uploaded or fetched | **Remove** on the user page or their own **My profile** page (`DELETE /api/users/:id/avatar`), or delete the user: `deleteUser` removes the picture in the same transaction |

An email or picture that came from your identity provider is copied again at
the user's next SSO sign-in or SCIM update, so remove it at the IdP, or
deprovision the user there, first. The email is never written to the audit
log (only `emailSet` / `emailChanged` flags are), and `LOG_REDACT_PATHS`
redacts `email` and `*.email` in every service's logs. Audit rows keep the
user id of whoever acted.

## Verifying

```sh
# The customer is gone (404):
curl -H "Authorization: Bearer $KEY" "$BASE/v1/customers/<id>"
# Their connections are gone:
curl -H "Authorization: Bearer $KEY" "$BASE/v1/connections"
# Audit trail shows the deletes:
#   Admin → Audit log → filter target_id = <connection id>
```
