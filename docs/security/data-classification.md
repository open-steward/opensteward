# Data classification and masking

**Audience:** contributors adding a resource or a field, and operators deciding who may see stored data.

OpenSteward stores a normalized copy of every synced record (see [persistence](../architecture/persistence.md)). Anyone reading that copy through the admin data viewer, an export or a destination sees it through one filter: the field classification of the record's resource type.

## Classes

| Class | Meaning | What a reader sees |
|---|---|---|
| `public` | Safe for anyone who can see the connection. | The value. |
| `internal` | Operational data: ids, statuses, dates, SKUs. | The value. This is the default for fields no rule names. |
| `pii` | Personal data about a natural person: names, emails, phone numbers, addresses, tax ids, free-text notes. | A masked value, unless the reader holds `data:read_pii` **and** asks for it (`?reveal=pii`). |
| `financial` | Amounts, totals, balances and prices. | The value. It is masked only when the deployment turns on `data_access.mask_financial` (off by default). |
| `secret` | Credentials and tokens. | Nothing. The field is removed from the record for every reader. |

`metadata` and `raw` hold the platform's unmodified upstream payload. Nobody has reviewed what they contain, so both are treated as `pii`/`redact` unless a rule names the field itself. A rule for `metadata.foo` does not cover the rest of `metadata`. `stripRawPayload` still runs first and removes the payload entirely for payments and accounting when their raw-payload flag is off.

## Masks

A masked `pii` or `financial` field is rendered by its rule's `mask` (default `redact`):

| Mask | Example |
|---|---|
| `email` | `jane.doe@example.com` → `j***@example.com` |
| `phone` | `+46 70 123 45 67` → `+** ** *** ** 67` |
| `name` | `Jane van Doe` → `J*** v*** D***` |
| `address` | Every leaf becomes `***`, except `country` / `countryCode` |
| `redact` | `[REDACTED]` |
| `hmac` | 16 hex characters of HMAC-SHA256. The same input always gives the same output, so records can still be joined on the value, but it cannot be reversed. The key is derived from `STORE_SECRET` with HKDF (label `opensteward-data-mask-v1`), so a masked value can't be used to test guesses against the encryption key. |

`null` and absent values are never masked. The fact that a value is missing is not sensitive.

## Search and filters

A filter on a masked field works as an oracle: `email contains "jane"` answers exactly what the mask is there to refuse. So the data-access routes accept a filter or free-text search on a path only when `isSearchable` allows it:

- `secret` is never searchable.
- `pii` is searchable only with `data:read_pii`.
- `financial` is searchable unless financial masking is on.
- A path counts as its **most restrictive** relative. Filtering `address.country` under a `pii` `address` is refused, and so is filtering `contact` when `contact.email` is `pii`.

A refused filter answers `400 FIELD_NOT_SEARCHABLE`. Free-text search (`q`) quietly skips paths the reader may not search.

## Where classifications live

| What | Where |
|---|---|
| Types, `applyMasking`, `isSearchable`, `FIELD_RULES`, `deriveMaskKey` | `packages/shared/src/data-classification/` |
| One sidecar per vertical: `CLASSIFICATION` (resource type → path → rule) and `RESOURCE_SCHEMAS` (resource type → canonical Zod schema) | `apps/integration-server/src/verticals/<v>/schema/classification.ts` |
| Registry across all verticals: `getClassification(vertical, type)`, `getResourceSchema` | `apps/integration-server/src/data-access/classification-registry.ts` |
| Routes that apply it | `apps/integration-server/src/data-access/router.ts` (`/admin/data/*`) |

Path grammar: `email` (top level), `billingAddress.city` (nested), `billingAddress.*` (every child), `emails[]` (every element), `emails[].email` (a field of every element). The key `'*'` is the default for top-level fields no other rule names. Rules apply shallowest first, so a masked parent hides its children as a whole. A `secret` below a revealed parent is still removed.

A resource type that is stored but has no classification (for example one cached by a read-through route that the sync worker never lists) is served **fully masked**. The viewer fails closed.

## Adding a resource or a field

1. Add the resource type to `RESOURCE_SCHEMAS` and `CLASSIFICATION` in the vertical's `schema/classification.ts`, next to its entry in `sync/listable-resources.ts`.
2. Start from `'*': FIELD_RULES.internal`, then name every field that holds personal data, money or a credential. Use the helpers: `FIELD_RULES.piiEmail`, `piiPhone`, `piiName`, `piiAddress`, `pii`, `piiHmac`, `financial`, `secret`.
3. Run `pnpm check:field-classification`.

The check (`scripts/check-field-classification.ts`, run in CI) fails when:

- a listable resource type has no classification, or no schema;
- a classification names a type that is not listable, or a top-level field that is not in the schema (a typo classifies nothing);
- a top-level field whose name matches `email|phone|first_?name|last_?name|address|iban|tax_?id|birth|ssn` is effectively `public` or `internal`. A `pii` rule on any of its descendants counts, so `telephones[].telephone` covers `telephones`;
- an allow-list entry no longer matches such a field.

A field that really isn't personal data, such as the merchant's own warehouse address, goes in `ALLOWLIST` in the script along with the reason. The check has unit tests in `scripts/check-field-classification.test.ts` (`pnpm test:guard-scripts`).

## The data-access scope

admin-api calls `/admin/data/*` with the deployment admin secret and passes the signed-in operator's access as a scope (`X-OpenSteward-Data-Scope`, JSON):

```json
{ "tenants": "*" | ["tenant-id", …], "verticals": { "crm": "*", "accounting": ["invoices"] }, "revealPii": false, "maskFinancial": false }
```

integration-server checks the scope again against `credentials.owner_tenant_id`. This is defence in depth: on SQLite, `resources.db` is a file only integration-server can read. A connection with no owner tenant is visible only to a `'*'` scope. A connection, type or record outside the scope answers `404`, never `403`, so a scope cannot be used to probe for ids it isn't allowed to see.
