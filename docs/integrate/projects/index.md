---
vertical: projects
title: Projects
last_verified: 2026-06-14
written_by: claude
---

# Projects (`projects`)

Unified read surface across project / task management platforms. 38 adapters are listed below.

**Majors:** Asana — reference implementation, Jira, Linear, Monday, ClickUp, Trello, Basecamp, Smartsheet, Microsoft Planner, Wrike

**Extended ecosystem:**
- Teamwork, Airtable, Todoist, Shortcut, Hive, Height, Zoho Projects, YouTrack, Quire, ProofHub, Freedcamp, Avaza, TeamGantt, Businessmap (Kanbanize), Forecast, Apptio Targetprocess, Pivotal Tracker — EOL-flagged

**Regional:**
- Backlog — JP, Kintone — Japan/Cybozu, Teambition — CN, Worktile — CN, Tower.im — China, Lark — ByteDance global APAC, Stackfield — DE, MeisterTask — Austria, Productive — Croatia, Bitrix24 — Belarus CRM+PM, Runrun.it — Brazil

## Canonical schema

| Resource | Purpose |
|---|---|
| `Project` | Workspace-scoped container of tasks. |
| `Task` | Atomic unit of work. `parentId` self-pointer for hierarchies; `metadata.platformType` carries level semantics (epic/story/subtask/sub-issue/subitem). |
| `Comment` | Body text on a task or project. Text included verbatim; attachment content refused. |
| `Tag` | Taxonomy. |
| `Workspace` | Top-level org boundary. |
| `User` | Platform user identity. PII-minimal: name + email only. |

## Refused at the schema level

- Attachment content (bytes) — surface `attachmentCount` only
- Time-tracking entries — not part of this vertical's schema
- User PII beyond name + email
- Custom-field schemas (values land in metadata)
- Private workspaces for non-consented accounts

## Hierarchy — flat-with-parent-pointer

The canonical `Task` uses `parentId` for all hierarchy. Platform-specific level names live in `Task.metadata.platformType`:

- Jira: epic → story → subtask (3 levels via parentId chain)
- Asana: task → subtask (1 level)
- Linear: issue → sub-issue (1 level)
- ClickUp: 6-level container hierarchy collapsed to flat tasks; full path in `Project.metadata.containerPath`

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/projects/projects` | List projects |
| GET | `/v1/projects/projects/{id}` | Get one |
| GET | `/v1/projects/tasks?project_id=…` | List tasks in a project |
| GET | `/v1/projects/tasks/{id}` | Get one task |
| GET | `/v1/projects/comments?task_id=…` | List comments on a task |
| GET | `/v1/projects/tags?workspace_id=…` | List tags in a workspace |
| GET | `/v1/projects/workspaces` | List workspaces |
| GET | `/v1/projects/users?workspace_id=…` | List members of a workspace |

## Authentication

Tenant mode (`Authorization: Bearer oi_…`). Each `/v1/projects/*` request requires `connection_id` (UUID from OAuth callback). No end-user mode mount.
