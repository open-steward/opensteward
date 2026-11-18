# lemlist CRM Adapter

Maps the [lemlist REST API](https://developer.lemlist.com/api-reference/getting-started/overview) to
the canonical CRM vertical.

## Auth

HTTP Basic — empty username + API key as password.
`credentials.accessToken` = API key.

## Implemented resources

| Resource   | Methods               | Notes                                      |
|------------|-----------------------|--------------------------------------------|
| Contacts   | list, get, create, update, delete | Maps to lemlist `/contacts` |
| Pipelines  | list, get             | Mapped from lemlist Campaigns (`/campaigns`) |
| Activities | list                  | Mapped from lemlist Activity history (`/activities`) |

## Omitted resources

The following canonical CRM resources have **no equivalent** in the lemlist API and are
intentionally omitted. The registry returns HTTP 501 automatically for any method not
implemented on the adapter class.

| Resource  | Reason omitted |
|-----------|----------------|
| **Notes** | lemlist has no Notes concept. Email and task content is captured via Activities instead. |
| **Companies** | lemlist has a `/companies` endpoint but it stores sender-side organisation data (workspace-level), not a contact-linked CRM company entity. It does not map cleanly to the canonical `Company` schema (no `domain`, `owner_id`, deal associations, etc.) and is omitted rather than force-fitted. |
| **Deals** | lemlist is a sales-engagement / outreach tool, not a pipeline CRM. It has no Deals or Opportunities concept. |
