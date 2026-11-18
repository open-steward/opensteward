# Odoo Project adapter

Odoo's Project app, over the shared Odoo client (`@opensteward/shared`
`adapter/odoo`): JSON-2 (`/json/2/<model>/<method>`) on Odoo 19+, External
RPC (`/jsonrpc` `execute_kw`) on Odoo 14–18, as the connection chooses.

Editions: Project is in Odoo Community, so this works on Community and
Enterprise, self-hosted, Odoo.sh or Odoo Online. On Odoo Online, "Access to
data via the external API is only available on Custom Odoo pricing plans"
(https://www.odoo.com/documentation/19.0/developer/reference/external_api.html).
Odoo 14 or later: API keys are "New in version 14.0".

Auth: the shared Odoo form — Odoo URL, API version, database, login and API
key. Keys last at most three months.

Webhook: none. Odoo documents no outbound webhook signature.

Read-only: the projects vertical has no write methods.

## Resources

| Canonical  | Odoo model                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| Projects   | `project.project`                                                             |
| Tasks      | `project.task` with `project_id` = the project                                |
| Comments   | `mail.message` with `model` `project.task`, `res_id` the task, type `comment` |
| Tags       | `project.tags`                                                                |
| Workspaces | `res.company`                                                                 |
| Users      | `res.users` with `share` = False (internal users) in the company              |

Lists page with `search_read` `offset` / `limit` in id order, with
`search_count` for the total. `updated_after` adds `write_date >=` the
watermark (to the second, so inclusive) to every list.

## Caveats for callers

- **Workspaces are companies.** Odoo has no workspace object; `workspaceId`
  on a project is its `company_id`, empty when a 17.0+ project has no company.
- **Tags have no workspace.** `project.tags` is one set per database, so
  `listTags` returns every tag whatever `workspace_id` is, and `workspaceId`
  on a tag is empty. The tag `color` is an Odoo palette index (1–11), kept as
  `metadata.colorIndex`, not a colour.
- **Task status.** 17.0+: from `state` — In Progress and Changes Requested →
  `in_progress`, Approved → `in_review`, Waiting → `open`, Done → `closed`,
  Cancelled → `cancelled`. 14.0–16.0 have no `state`: a task in a closing
  stage (`is_closed`) is `closed`; otherwise `kanban_state` Ready →
  `in_review`, In Progress / Blocked → `in_progress`. The stage itself
  (`project.task.type`, customer-defined) is in `metadata.stageId` /
  `stageName`.
- **Task priority** is read against the server's own selection (one
  `fields_get` per database): 19.0's four values map to low / medium / high /
  urgent, 14.0–18.0's two to low / high. The raw key is in
  `metadata.priority`.
- **Private tasks** (no project, 17.0+) are never listed, since tasks are
  listed per project; `getTask` returns one with an empty `projectId`.
- **Comments** are user comments and log notes (`message_type` `comment`);
  notifications and emails are not. `authorId` is the `create_uid` user (the
  id space of assignees and users); the `res.partner` author is
  `metadata.authorPartnerId`. `getComment` 404s any message that is not a
  comment on a task or project.
- **Archived records.** Lists use `search_read`, which applies Odoo's default
  `active` filter; get-by-id uses `read`, which does not, so an archived
  project is returned with status `archived`.
- **Descriptions and comment bodies** are Odoo HTML reduced to plain text.
- **Odoo 14–18.** Field sets differ by version (`state` is 17.0+, `user_ids`
  15.0+ with `user_id` before, `tag_ids` and `last_update_status` on projects
  15.0+, `milestone_id` 16.0+). The shared client asks `fields_get` first and
  reads only fields the server has.
