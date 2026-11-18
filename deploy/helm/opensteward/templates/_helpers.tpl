{{/* Base name + fullname (release-prefixed, DNS-safe, <=63 chars). */}}
{{- define "opensteward.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opensteward.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "opensteward.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "opensteward.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels. Pass the root context. */}}
{{- define "opensteward.labels" -}}
helm.sh/chart: {{ include "opensteward.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: opensteward
{{ include "opensteward.commonSelectorLabels" . }}
{{- end -}}

{{- define "opensteward.commonSelectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Per-service labels/selector. Pass dict {root, name}. */}}
{{- define "opensteward.serviceLabels" -}}
{{ include "opensteward.labels" .root }}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .name }}
{{- end -}}

{{- define "opensteward.serviceSelector" -}}
{{ include "opensteward.commonSelectorLabels" .root }}
app.kubernetes.io/name: {{ .name }}
{{- end -}}

{{/* Image ref for a service. Pass dict {root, name}. Prefers a digest. */}}
{{- define "opensteward.image" -}}
{{- $img := .root.Values.image -}}
{{- $repo := printf "%s/%s" $img.registry .name -}}
{{- if $img.digest -}}
{{- printf "%s@%s" $repo $img.digest -}}
{{- else -}}
{{- printf "%s:%s" $repo (default .root.Chart.AppVersion $img.tag) -}}
{{- end -}}
{{- end -}}

{{- define "opensteward.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "opensteward.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Pod + container securityContext — mirrors docker-compose.hardening.yml. */}}
{{- define "opensteward.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "opensteward.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/* Resolve a browser-facing URL. dict {root, key, service, fallbackCluster}.
     explicit publicUrls.<key> wins; else cluster DNS (if fallbackCluster);
     else empty (caller omits the env var). */}}
{{- define "opensteward.publicUrl" -}}
{{- $explicit := index .root.Values.publicUrls .key -}}
{{- if $explicit -}}
{{- $explicit -}}
{{- else if .fallbackCluster -}}
{{- $port := (index .root.Values.services .service).port -}}
{{- printf "http://%s-%s:%v" (include "opensteward.fullname" .root) .service $port -}}
{{- end -}}
{{- end -}}

{{/* Per-service environment. dict {root, name}. */}}
{{- define "opensteward.serviceEnv" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- $full := include "opensteward.fullname" $root -}}
{{- $pg := eq $root.Values.database.mode "postgres" -}}
- name: NODE_ENV
  value: {{ $root.Values.nodeEnv | quote }}
- name: PORT
  value: {{ (index $root.Values.services $name).port | quote }}
- name: HOST
  value: "0.0.0.0"
{{- if and $pg (index $root.Values.services $name).stateful }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ required "database.external.existingSecret is required when database.mode=postgres" $root.Values.database.external.existingSecret }}
      key: {{ $root.Values.database.external.secretKey }}
{{- end }}
{{- if has $name (list "admin" "docs-server") }}
{{/* Platform logos. Both surfaces render the same catalog component, so they
     must agree on the logo source or the two pages disagree about whether
     logos exist. These are the BOOTSTRAP defaults only: an operator can
     set the source and Brandfetch client ID from the admin UI, and those
     admin-saved values win. Defaults to none — no external requests. See
     docs/operations/platform-logos.md. */}}
- name: LOGO_SOURCE
  value: {{ $root.Values.logos.source | default "none" | quote }}
{{- if $root.Values.logos.brandfetchClientId }}
- name: BRANDFETCH_CLIENT_ID
  value: {{ $root.Values.logos.brandfetchClientId | quote }}
{{- end }}
{{- end }}
{{- if eq $name "docs-server" }}
{{/* docs-server reads runtime settings from admin-api to pick up the
     operator's logo choice. Injected as a single targeted key rather than by
     adding docs-server to `needsSecret`: envFrom would hand this public-facing
     pod JWT_SECRET, SESSION_SECRET, STORE_SECRET and ADMIN_SECRET as well,
     which is a real privilege expansion for one setting. Absent => the pod
     falls back to LOGO_SOURCE from the environment. */}}
- name: SERVICE_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "opensteward.secretName" $root }}
      key: SERVICE_SECRET
      optional: true
{{- end }}
{{- if eq $name "admin" }}
- name: ADMIN_API_URL
  value: "http://{{ $full }}-admin-api:3001"
- name: DOCS_SERVER_URL
  value: {{ include "opensteward.publicUrl" (dict "root" $root "key" "docsServer" "service" "docs-server" "fallbackCluster" true) | quote }}
- name: SSO_PUBLIC_BASE_URL
  value: {{ include "opensteward.publicUrl" (dict "root" $root "key" "adminApi" "service" "admin-api" "fallbackCluster" true) | quote }}
{{- else if eq $name "admin-api" }}
{{- range $alias := list "INTEGRATION_SERVER_URL" "ACCOUNTING_URL" "CRM_URL" "ECOMMERCE_URL" "LOGISTICS_URL" }}
- name: {{ $alias }}
  value: "http://{{ $full }}-integration-server:3010"
{{- end }}
- name: SSO_PUBLIC_BASE_URL
  value: {{ include "opensteward.publicUrl" (dict "root" $root "key" "adminApi" "service" "admin-api" "fallbackCluster" true) | quote }}
- name: ADMIN_UI_URL
  value: {{ include "opensteward.publicUrl" (dict "root" $root "key" "adminUi" "service" "admin" "fallbackCluster" true) | quote }}
{{- if $root.Values.superset.enabled }}
{{- include "opensteward.supersetEnv" $root }}
{{- end }}
{{- else if eq $name "docs-server" }}
- name: INTEGRATION_SERVER_URL
  value: "http://{{ $full }}-integration-server:3010"
- name: ADMIN_API_URL
  value: "http://{{ $full }}-admin-api:3001"
{{- else if eq $name "integration-server" }}
- name: ADMIN_API_URL
  value: "http://{{ $full }}-admin-api:3001"
- name: DATA_STORE_MODE
  value: "database"
{{- if $root.Values.analytics.sqlAccess.enabled }}
{{- include "opensteward.sqlAccessEnv" $root }}
{{- end }}
{{- if $root.Values.redis.enabled }}
- name: REDIS_URL
  value: {{ required "redis.url is required when redis.enabled" $root.Values.redis.url | quote }}
{{- end }}
{{- $pub := include "opensteward.publicUrl" (dict "root" $root "key" "integrationServer" "service" "integration-server" "fallbackCluster" false) }}
{{- if $pub }}
- name: PUBLIC_BASE_URL
  value: {{ $pub | quote }}
{{- end }}
{{- if include "opensteward.licenseSecret" $root }}
- name: OPENSTEWARD_LICENSE_FILE
  value: "/etc/opensteward/license/license.key"
{{- end }}
{{- end }}
{{- end -}}

{{/* The license Secret's name, or "" when none is set. Pass the root context.
     Nil-safe on purpose: `helm upgrade --reuse-values` from a release installed
     before license.* existed renders with that release's chart defaults, which
     have no `license` key, and a bare .Values.license.existingSecret would fail
     the whole upgrade on a nil pointer. */}}
{{- define "opensteward.licenseSecret" -}}
{{- (.Values.license | default dict).existingSecret | default "" -}}
{{- end -}}

{{/* The key inside that Secret. Absent (the same --reuse-values case) means
     license.key; an explicit empty string is refused here and by
     values.schema.json (minLength 1). */}}
{{- define "opensteward.licenseSecretKey" -}}
{{- $license := .Values.license | default dict -}}
{{- if hasKey $license "secretKey" -}}
{{- required "license.secretKey is required when license.existingSecret is set" $license.secretKey -}}
{{- else -}}
license.key
{{- end -}}
{{- end -}}

{{/* Services this service needs secret env from (envFrom). */}}
{{- define "opensteward.needsSecret" -}}
{{- if or (eq .name "admin") (eq .name "admin-api") (eq .name "integration-server") -}}true{{- end -}}
{{- end -}}

{{/* Name of the Secret pods envFrom. */}}
{{- define "opensteward.secretName" -}}
{{- if eq .Values.secrets.source "existingSecret" -}}
{{- required "secrets.existingSecret is required when secrets.source=existingSecret" .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "opensteward.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* ── Optional analytics: read-only SQL access + embedded Superset ──────── */}}

{{/* Fail closed on analytics settings that cannot work. Included by the
     analytics templates, which render on every install. */}}
{{- define "opensteward.validateAnalytics" -}}
{{- $a := .Values.analytics -}}
{{- $pg := eq .Values.database.mode "postgres" -}}
{{- if and $a.sqlAccess.enabled (not $pg) }}
{{- fail "analytics.sqlAccess.enabled=true needs database.mode=postgres: read-only SQL access runs on the Postgres backend only." }}
{{- end }}
{{- if .Values.superset.enabled }}
{{- if not $pg }}
{{- fail "superset.enabled=true needs database.mode=postgres: embedded Superset reads the Postgres analytics views." }}
{{- end }}
{{- if not $a.sqlAccess.enabled }}
{{- fail "superset.enabled=true needs analytics.sqlAccess.enabled=true: Superset connects through a read-only SQL principal onto the masked views." }}
{{- end }}
{{- if not $a.superset.publicUrl }}
{{- fail "analytics.superset.publicUrl is required when superset.enabled: it is the Superset URL the admin UI frames." }}
{{- end }}
{{- if not (index (.Values.superset.extraEnv | default dict) "OPENSTEWARD_ADMIN_ORIGIN") }}
{{- fail "superset.extraEnv.OPENSTEWARD_ADMIN_ORIGIN is required when superset.enabled: the admin UI origin is the only site allowed to frame Superset." }}
{{- end }}
{{- if not .Values.publicUrls.adminUi }}
{{- fail "publicUrls.adminUi is required when superset.enabled: embedded dashboards allow only that origin." }}
{{- end }}
{{- if and (not .Values.superset.postgresql.enabled) (not .Values.superset.database.host) }}
{{- fail "superset.database.host is required when superset.enabled (with superset.postgresql.enabled=false): the host of Superset's metadata database, which the Superset chart's init containers wait for. The URI itself comes from SUPERSET_METADATA_DB_URI in the Superset secret." }}
{{- end }}
{{- if and .Values.networkPolicy.enabled (not $a.superset.networkPolicy.allowFrom) }}
{{- fail "analytics.superset.networkPolicy.allowFrom is required when networkPolicy.enabled and superset.enabled: browsers reach Superset through your ingress controller, which the default-deny policy would otherwise block." }}
{{- end }}
{{- end }}
{{- end -}}

{{/* Secret holding the Superset service account (and Superset's own keys). */}}
{{- define "opensteward.supersetSecretName" -}}
{{- default (printf "%s-opensteward-superset" .Release.Name) .Values.analytics.superset.existingSecret -}}
{{- end -}}

{{/* In-cluster Superset URL: the Superset chart's Service unless overridden. */}}
{{- define "opensteward.supersetInternalUrl" -}}
{{- if .Values.analytics.superset.internalUrl -}}
{{- .Values.analytics.superset.internalUrl -}}
{{- else -}}
{{- $svc := ternary .Release.Name (printf "%s-superset" .Release.Name) (contains "superset" .Release.Name) -}}
{{- printf "http://%s:8088" ($svc | trunc 63 | trimSuffix "-") -}}
{{- end -}}
{{- end -}}

{{/* admin-api: embedded Superset settings. */}}
{{- define "opensteward.supersetEnv" }}
- name: SUPERSET_URL
  value: {{ include "opensteward.supersetInternalUrl" . | quote }}
- name: SUPERSET_PUBLIC_URL
  value: {{ required "analytics.superset.publicUrl is required when superset.enabled" .Values.analytics.superset.publicUrl | quote }}
- name: SUPERSET_SERVICE_USERNAME
  valueFrom:
    secretKeyRef:
      name: {{ include "opensteward.supersetSecretName" . }}
      key: SUPERSET_SERVICE_USERNAME
- name: SUPERSET_SERVICE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "opensteward.supersetSecretName" . }}
      key: SUPERSET_SERVICE_PASSWORD
{{- end }}

{{/* integration-server: read-only SQL access settings. */}}
{{- define "opensteward.sqlAccessEnv" }}
{{- $s := .Values.analytics.sqlAccess }}
{{- if $s.adminDatabaseUrl.existingSecret }}
- name: ANALYTICS_ADMIN_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ $s.adminDatabaseUrl.existingSecret }}
      key: {{ $s.adminDatabaseUrl.secretKey | default "ANALYTICS_ADMIN_DATABASE_URL" }}
{{- end }}
{{- if $s.readHost }}
- name: ANALYTICS_READ_HOST
  value: {{ $s.readHost | quote }}
{{- end }}
{{- if $s.rolePrefix }}
- name: ANALYTICS_ROLE_PREFIX
  value: {{ $s.rolePrefix | quote }}
{{- end }}
{{- end }}

