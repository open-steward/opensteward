# Rotating `STORE_SECRET`

Every encrypted-at-rest column in OpenSteward — OAuth tokens, platform
credentials, end-user PII, webhook signing secrets, SSO secrets, destination
credentials — derives its AES-256-GCM key from `STORE_SECRET` (via scrypt + a
per-store salt). The key behind `hmac` data masks is derived from it too (see
[Derived keys](#derived-keys-the-data-mask-key)).
Rotating that env var without first re-encrypting the existing data makes
every blob undecryptable on next boot.

This runbook covers offline rotation for the **docker-compose** deployment via
the bundled `pnpm rotate-store-secret` tool. Plan for a short maintenance window:
services must be stopped while the tool runs.

The tool takes either `--db <path>` (one or more SQLite files) or
`--database-url <postgres://…>` (one Postgres database holding every encrypted
table). The two are mutually exclusive — passing both is an error. The steps
below use the SQLite form, which is what the shipped compose file deploys.

> **On Kubernetes?** The Helm chart ships an in-cluster equivalent: set
> `rotation.enabled=true` (it scales the stateful Deployments to 0 and runs a
> rotate Job), update `STORE_SECRET` at its source, then disable rotation to
> scale back up. See the "Rotating `STORE_SECRET`" section of
> [`deploy/helm/opensteward/README.md`](../../deploy/helm/opensteward/README.md).
> The conceptual background below (which stores invalidate, the KDF salt) applies
> to both paths.

## What the tool does

1. Refuses to start if it detects a fresh `-wal` / `-shm` file next to any
   target db (a service is still attached — rotating now would corrupt
   in-flight writes).
2. Snapshots each db to `<file>.pre-rotation.bak`.
3. For every encrypted column it knows about
   (`packages/shared/src/sqlite/encrypted-blobs.ts`):
   - Decrypts each row's ciphertext with the **old** secret.
   - Re-encrypts with the **new** secret.
   - Updates the row inside a single per-file transaction.
4. If any row fails to decrypt with both keys, the whole file's transaction
   rolls back — the original is untouched. The `.pre-rotation.bak` is for
   operator paranoia, not rollback logic.

Re-runs are idempotent: a row that decrypts with the **new** secret
already (because a prior run was interrupted) is left alone.

## What the tool does NOT do

Two tables are hash-only — their rows mix `STORE_SECRET` into the scrypt
KDF salt, so the original plaintext can't be recovered:

- `developer_api_keys` (every API key issued to integration developers)
- `end_user_tokens` (every per-end-user MCP token)

**Rotation invalidates every row in those tables.** Developer keys do not
need to be re-entered by hand: each key's **Rotate** action at `/api-keys`
(backed by `POST /admin/api-keys/:id/rotate`, also `os api-keys rotate`)
mints a replacement with the same tenant, label, scopes and mode — rotation
reads only the key's metadata, never the old hash, so it works even though
the old key no longer verifies. (The usual 24h both-keys-work grace window
has no effect here for the same reason; treat Rotate as a straight re-mint
and roll the new plaintext out immediately. Keys already revoked or expired
are refused and stay dead.) End-user MCP tokens have no rotate endpoint —
re-mint each customer's tokens from that customer's page (`/customers/:id`,
agent-config section).

## Steps

```bash
# 1. Stop every service that has a writer on the data volumes.
docker compose stop integration-server admin-api webhook-gateway

# 2. Run the rotation. Pass every db file that holds encrypted data.
#    The paths below are where the files live for a host-run `pnpm dev`.
#    In a compose deployment they are inside named volumes — see
#    "Reaching the db files in a compose deployment" below.
pnpm rotate-store-secret \
  --old "$OLD_STORE_SECRET" \
  --new "$NEW_STORE_SECRET" \
  --db apps/integration-server/data/credentials.db \
  --db apps/integration-server/data/resources.db \
  --db apps/admin-api/data/admin.db

#    resources.db (the data store) holds destinations.encrypted_secrets, the
#    warehouse/lake destination credentials. Leave it out and every
#    destination fails to decrypt its credentials after the restart.
#
#    Postgres deployments rotate the whole database in one call instead:
#    pnpm rotate-store-secret --old "$OLD" --new "$NEW" \
#      --database-url "postgres://…"

# 3. Update STORE_SECRET in .env (or compose env) to the new value.

# 4. Restart services.
docker compose start integration-server admin-api webhook-gateway

# 5. Verify a known platform's clientSecret still decrypts: open the
#    /platforms/:vertical/:slug page; the form should prefill (the
#    redacted secret value is fine — what matters is that the row
#    decrypted without throwing).

# 6. Rotate each developer API key at /api-keys (or `os api-keys rotate`)
#    and re-mint end-user tokens from each customer's page.

# 7. If you use destinations: open /destinations and test each
#    one (**Test connection** on its page). It decrypts the stored
#    credentials, so a decryption failure here means
#    resources.db was left out of step 2.

# 8. If you use read-only SQL access (Postgres): press **Re-provision** at
#    /sql-access (or POST /api/sql-access/provision) so the SQL views pick
#    up the new hmac mask key. See "Derived keys" below.
```

Once everything is verified, delete the `.pre-rotation.bak` files. Keep
them until you're confident — they're the only durable copy of the
pre-rotation state.

## Reaching the db files in a compose deployment

`pnpm rotate-store-secret` runs on the host and takes host paths. The shipped
`docker-compose.yml` keeps both databases in named volumes
(`integration-server-data` → `/app/apps/integration-server/data/credentials.db`,
`admin-data` → `/app/apps/admin-api/data/admin.db`), so they are **not** at
`apps/<svc>/data/` in your checkout. Two ways to reach them:

- **Linux host, native docker daemon.**
  `docker volume inspect <project>_<volume> --format '{{.Mountpoint}}'` prints
  a real host path; pass it straight to `--db`. `integration-server-data`
  holds both `credentials.db` and `resources.db`. `<project>` is the lowercased
  basename of this directory unless `COMPOSE_PROJECT_NAME` is set.
- **Docker Desktop, or any VM-backed / remote daemon.** The mountpoint is a
  path inside the daemon's VM and does not exist on your host. Copy each db out
  with a helper container, rotate the copies, and copy them back:

  ```bash
  mkdir -p ./rotate
  docker run --rm -v opensteward_integration-server-data:/data:ro \
    -v "$(pwd)/rotate:/out" alpine:3 cp /data/credentials.db /data/resources.db /out/
  docker run --rm -v opensteward_admin-data:/data:ro \
    -v "$(pwd)/rotate:/out" alpine:3 cp /data/admin.db /out/

  pnpm rotate-store-secret --old "$OLD_STORE_SECRET" --new "$NEW_STORE_SECRET" \
    --db rotate/credentials.db --db rotate/resources.db --db rotate/admin.db

  docker run --rm -v opensteward_integration-server-data:/data \
    -v "$(pwd)/rotate:/in:ro" alpine:3 cp /in/credentials.db /in/resources.db /data/
  docker run --rm -v opensteward_admin-data:/data \
    -v "$(pwd)/rotate:/in:ro" alpine:3 cp /in/admin.db /data/
  ```

  Delete `./rotate` afterwards — it holds decryptable copies of every secret in
  the deployment.

The same host-path assumption affects `pnpm backup` / `pnpm restore`; see
[`backup-restore.md`](./backup-restore.md).

## Derived keys: the data mask key

Fields classified with the `hmac` mask (see
[data classification](../security/data-classification.md)) are shown as a
16-character HMAC token instead of their value. The HMAC key is not stored
anywhere you configure: it is derived from `STORE_SECRET` with HKDF (label
`opensteward-data-mask-v1`). Rotating `STORE_SECRET` therefore changes every
`hmac` token. Nothing needs re-encrypting, but tokens are only joinable when
they come from the same key:

| Where the token appears | After rotation |
|---|---|
| Data viewer, CSV/NDJSON exports | New tokens immediately. |
| Destinations (Parquet files, Postgres and warehouse tables) | Rows exported before the rotation keep the old tokens; rows exported after get new ones. Run a **Backfill** on the destination if you join on an `hmac` column across that boundary. Files already written are never rewritten. |
| Read-only SQL access (`os_analytics` views, embedded Superset) | The key is copied into `os_analytics_internal.mask_key` when SQL access is provisioned, and boot re-provisions only when the view catalog changed. Until you **Re-provision** at `/sql-access` (or `POST /api/sql-access/provision`), the views keep producing tokens under the old key, which no longer match the viewer or the exports. Manual mode never stores the key; there `hmac` columns read `[REDACTED]`. |

## Secrets `STORE_SECRET` does not cover

These rotate on their own schedule and are unaffected by the steps above:

- **Destination credentials themselves** (the S3 key, service-account JSON,
  warehouse password). To change them, use **Replace credentials** on the
  destination's page (`PUT /api/destinations/:id/credentials`, audited as
  `destination.credentials_rotate`); the old values are overwritten, never
  shown.
- **SQL access passwords.** Postgres keeps only a SCRAM verifier and
  OpenSteward keeps nothing, so there is nothing to re-encrypt. Rotate a
  login's password with **Rotate** at `/sql-access`; the old one stops working
  and its sessions are ended. See [SQL access](../integrate/sql-access.md#rotation-and-revocation).
- **Superset.** `SUPERSET_SECRET_KEY` encrypts Superset's own metadata
  database; changing it needs `superset re-encrypt-secrets`. The service
  account password is `SUPERSET_SERVICE_PASSWORD`. See
  [superset.md](./superset.md).

## Adding a new encrypted column

If you introduce a new encrypted-at-rest column anywhere, you must add a
matching entry to `packages/shared/src/sqlite/encrypted-blobs.ts`.
Otherwise the rotation tool will silently skip those rows and they'll be
unreadable after the next rotation.

The unit tests in `packages/shared/tests/scripts/rotate-store-secret.test.ts`
cover the round-trip for the existing columns; add coverage for any new
ones.
