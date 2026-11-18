# Odoo Helpdesk adapter

Odoo's Helpdesk app, over the shared Odoo client (`@opensteward/shared`
`adapter/odoo`): JSON-2 (`/json/2/<model>/<method>`) on Odoo 19+, External
RPC (`/jsonrpc` `execute_kw`) on Odoo 14–18, as the connection chooses.

**Edition.** Helpdesk is Odoo Enterprise only ("helpdesk - Odoo Enterprise
only", odoo/documentation 19.0 `mixins.rst`). A Community database has no
`helpdesk.*` models, and every ticket and team call fails there. On Odoo
Online, the external API needs the Custom plan: "Access to data via the
external API is only available on Custom Odoo pricing plans"
(https://www.odoo.com/documentation/19.0/developer/reference/external_api.html).

Auth: the shared Odoo form: Odoo URL, API version, database, login and API
key. Keys last at most three months, so the connection has to be reconnected
with a new key before the old one expires.

Webhook: none. Odoo documents no webhook signature, so the adapter ships no
verifier and every inbound delivery is refused.

## Resources

| Canonical | Odoo model                                                                           |
| --------- | ------------------------------------------------------------------------------------ |
| Tickets   | `helpdesk.ticket`                                                                    |
| Messages  | `mail.message` with `model = 'helpdesk.ticket'`, `message_type` `email` or `comment` |
| Contacts  | `res.partner`                                                                        |
| Users     | `res.users` with `share = false` (internal users)                                    |
| Teams     | `helpdesk.team`                                                                      |

## Refused (501)

- Tags: no public Odoo source names the tag model or the ticket's tag field.
- Macros: Helpdesk has none of its own. The mail module's canned responses are
  `mail.shortcode` up to 17.0 and `mail.canned.response` from 18.0, and an
  Odoo 14–18 connection does not record which of those versions it runs.

Lists page with `search_read` `offset` / `limit` in id order, with
`search_count` for the total. `updated_after` becomes `write_date >=` that instant
(UTC, second granularity, inclusive) on every list; `write_date` is the ORM's
access-log column, "Stores when the record was last updated" (19.0 ORM
reference).

## Where the field names come from

Helpdesk's source is not public (github.com/odoo/enterprise is private). The
`helpdesk.ticket` and `helpdesk.team` field names are the ones Odoo sets in
its own demo data (github.com/odoo/industry, branch 19.0, `*/demo/helpdesk_ticket.xml`
and `bike_shop/data/helpdesk_team.xml`). `mail.message`, `mail.message.subtype`,
`res.partner` and `res.users` are Community models, so their fields are quoted
from odoo/odoo 14.0 and 19.0. The shared client asks `fields_get` first and
reads only the fields the server reports, so a field one Odoo version lacks is
left out of the result, not treated as an error.

## Caveats for callers

- **Status** is `closed` when the ticket has a `close_date` and `open`
  otherwise. Odoo tickets have no status field, only team-defined stages
  ("the ticket is moved to a folded stage. This marks the ticket as
  closed"), and stage names are the customer's own. The stage is in
  `metadata.stage` / `metadata.stageId`.
- **Priority** maps Odoo's 0–3 stars (Low, Medium, High, Urgent) onto
  `low`, `normal`, `high`, `urgent`. The raw value is in
  `metadata.rawPriority`.
- **Channel** is always `unknown`. Tickets from the email alias, live chat
  and website form are the same record, and nothing on it says which channel
  it came from.
- **Tags** are always `[]`, and a user's `teamIds` is always `[]`. Team
  membership is not read.
- **Requester** is the ticket's `partner_id`. A ticket with only a typed-in
  customer name has `requesterId: ''` and the name in
  `metadata.requesterName`.
- **Messages** are the ticket chatter entries written by a person: incoming
  emails and comments. Tracking and system notifications are left out, and so
  is the ticket description. A message is `public` by Odoo's own rule for what
  portal users can see: not `is_internal`, and it has a subtype that is not
  `internal`. Anything else is `internal`. The author is the internal user
  whose partner wrote it (`authorType: 'user'`), otherwise the partner
  (`'contact'`). A message with no author partner is `authorType: 'unknown'`.
- **Contacts** are all of `res.partner`: people and companies, not only those
  who have filed tickets.
- **Archived records.** Lists use `search_read`, which applies Odoo's default
  `active` filter. `get*` uses `read`, which does not.
