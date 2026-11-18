/**
 * HTML templates for the hosted Connect Link flow.
 *
 *   landingHtml(...)  → branded picker + adapter form ("/connect/:token")
 *   thankYouHtml(...) → consumed-session summary       ("/connect/:token/done")
 *   errorHtml(...)    → 404 / 410 page for missing or expired tokens
 *
 * All three reuse the shared design-system tokens (mounted at /design/* on
 * integration-server) and follow the same composition pattern as
 * docs-server's providersHtml().
 */
import type { CredentialField } from '../adapter/base'
import { brandingHead } from './branding-head'
import type { HostBranding } from './host-info'

const VERTICAL_LABEL: Record<string, string> = {
  crm: 'CRM',
  api: 'API',
  sdk: 'SDK',
  docsign: 'E-signature',
  'customer-support': 'Customer Support',
}
const VERTICAL_TILE_CLASS: Record<string, string> = {
  accounting: 'vtile--accounting',
  crm: 'vtile--crm',
  ecommerce: 'vtile--ecommerce',
  logistics: 'vtile--logistics',
  payments: 'vtile--payments',
  docsign: 'vtile--docsign',
  projects: 'vtile--projects',
  'customer-support': 'vtile--customer-support',
  inventory: 'vtile--inventory',
}

function vLabel(v: string): string {
  return VERTICAL_LABEL[v] ?? v.charAt(0).toUpperCase() + v.slice(1)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value)
}

/**
 * Serialize a value for embedding inside an inline `<script>`. `JSON.stringify`
 * alone does NOT neutralize a literal `</script>` (nor `<!--`, nor the JS line
 * terminators U+2028/U+2029), so a string carrying `</script>` would terminate
 * the element and start an attacker-controlled one — a stored XSS. Escaping the
 * HTML-significant characters to their `\uXXXX` forms keeps the JSON valid and
 * round-trips to the identical value in the browser. Use this for EVERY `${...}`
 * that lands inside a `<script>` block (`escapeHtml` is for HTML text/attribute
 * context and is wrong here).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

const BASE_HEAD = `
  <link rel="stylesheet" href="/design/tokens.css">
  <link rel="stylesheet" href="/design/base.css">
  <link rel="stylesheet" href="/design/components.css">
  <link rel="icon" href="/design/logo/mark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/design/logo/mark-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
`

/** Brand name for a page title. Falls back to the default product name unless
 *  the operator has opted out of attribution, in which case a neutral label
 *  is used so the title never reads "OpenSteward". */
function titleName(host: HostBranding): string {
  return host.name ?? (host.hideAttribution ? 'Connect' : 'OpenSteward')
}

const DEFAULT_MARK_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="OpenSteward" style="height: 28px; width: 28px; color: var(--accent); flex: none;"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="32" r="8.5"/><line x1="26.5" y1="32" x2="52" y2="32"/><line x1="44" y1="32" x2="44" y2="40"/><line x1="50" y1="32" x2="50" y2="38"/></g></svg>`

function brandHeader(host: HostBranding): string {
  // An explicit logo always renders. Otherwise we fall back to the default
  // OpenSteward mark — unless white-label attribution is suppressed, in which
  // case we render no mark at all.
  const mark = host.logoDataUrl
    ? `<img src="${escapeAttr(host.logoDataUrl)}" alt="${escapeAttr(host.name ?? 'Host')}" style="height: 32px; width: auto;">`
    : host.hideAttribution
      ? ''
      : DEFAULT_MARK_SVG
  // Likewise the wordmark: operator name wins; the "OpenSteward" default is
  // suppressed under white-label.
  const name = host.name ?? (host.hideAttribution ? '' : 'OpenSteward')
  return `
    <header class="connect-shell__header">
      <div class="connect-shell__brand">
        ${mark}
        ${name ? `<span>${escapeHtml(name)}</span>` : ''}
      </div>
    </header>
  `
}

const SHARED_STYLES = `
  <style>
    body { background: var(--paper); color: var(--fg-1); }
    .connect-shell { max-width: 720px; margin: 0 auto; padding: var(--space-10) var(--space-6); }
    .connect-shell__header {
      max-width: 720px; margin: 0 auto;
      padding: var(--space-4) var(--space-6);
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
    }
    .connect-shell__brand { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; color: var(--fg-1); }

    .connect-card {
      background: var(--surface-0);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-8);
    }
    .eyebrow { color: var(--fg-3); font-size: var(--text-xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; font-weight: 600; }
    h1.connect-h1 { font-size: var(--text-3xl); line-height: var(--leading-tight); letter-spacing: var(--tracking-tight); margin: var(--space-2) 0 var(--space-3); color: var(--fg-1); }
    .connect-lead { color: var(--fg-2); margin: 0 0 var(--space-6); }

    .vertical-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .vertical-tabs button {
      height: 32px; padding: 0 var(--space-3);
      background: var(--surface-0); color: var(--fg-2);
      border: 1px solid var(--border-default); border-radius: var(--radius-full);
      font-size: var(--text-xs); font-weight: 500; cursor: pointer;
    }
    .vertical-tabs button[aria-pressed="true"] {
      background: var(--accent-muted); color: var(--accent-fg); border-color: var(--accent-muted);
    }

    .adapter-grid {
      display: grid; gap: var(--space-2);
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
    .adapter-card {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--surface-0);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: var(--fg-1);
      transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
    }
    .adapter-card:hover { border-color: var(--border-strong); background: var(--surface-1); }
    .adapter-card[aria-pressed="true"] { border-color: var(--accent); }
    .adapter-card__name { font-weight: 600; }
    .adapter-card__meta { color: var(--fg-3); font-size: var(--text-xs); margin-top: 2px; }

    .connect-cta { margin-top: var(--space-6); display: flex; justify-content: flex-end; gap: var(--space-3); }

    .field-group { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-4); }

    .alert { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-default); background: var(--surface-1); color: var(--fg-2); font-size: var(--text-sm); }
    .alert--danger { background: var(--danger-bg); color: var(--danger-fg); border-color: var(--danger); }
    .alert--info { background: var(--info-bg); color: var(--info-fg); border-color: var(--info); }

    .footer-note { margin-top: var(--space-8); color: var(--fg-3); font-size: var(--text-xs); text-align: center; }
    .footer-note a { color: var(--fg-2); }
  </style>
`

export interface CatalogEntry {
  vertical: string
  slug: string
  name: string
  authType: string
  /** When present, the adapter supports the link flow via direct credential entry. */
  credentialFields?: CredentialField[]
  /** True when the adapter supports OAuth (and therefore is link-ready by default). */
  oauth: boolean
  /**
   * Non-secret inputs an OAuth adapter needs BEFORE the redirect (Shopify
   * `shop`). Rendered on OAuth tiles and posted with `oauth-start`.
   */
  oauthFields?: CredentialField[]
}

export function landingHtml(args: {
  token: string
  //
  // Deliberately NOT given the connect link's label. The label is the
  // operator's internal name for the link, and the form that sets it says so —
  // "For your reference only". It was nonetheless printed here as the page's
  // eyebrow, in front of the customer. Auto-derived labels turned that from
  // inaccurate into a leak: they read "<customer> - <tenant> - <adapter> -
  // <minted-at>", so the operator's tenant name and the minute they minted the
  // link became the headline of a page they send to third parties. The host's
  // own name and mark already identify the page (see `brandHeader`), which is
  // the identification a customer actually needs.
  //
  host: HostBranding
  customerEmail: string | null
  catalog: CatalogEntry[]
  /** Pre-selected vertical/platform if the link was scoped at creation time. */
  preselect?: { vertical: string; platform: string } | null
  /** Banner text shown at the top of the page (e.g. validation error). */
  flash?: string | null
  /** When true and `customerEmail` is null, render the self-register form
   *  in place of the adapter picker. Submitting attaches the customer to
   *  the link and reloads the page into the normal picker view. */
  selfRegister?: boolean
  /** CSP nonce for the single inline <script>. When set, the caller must send a
   *  matching `script-src 'nonce-…'` header so the page's own bootstrap runs
   *  while any injected inline script (defence-in-depth over escaping) does not. */
  nonce?: string
}): string {
  const { token, host, customerEmail, catalog, preselect, flash, selfRegister, nonce } = args
  const scriptNonce = nonce ? ` nonce="${escapeAttr(nonce)}"` : ''
  const showSelfRegister = !!selfRegister && !customerEmail

  const verticals = Array.from(new Set(catalog.map((c) => c.vertical))).sort()
  const initialVertical = preselect?.vertical ?? verticals[0] ?? null

  const customerLine = customerEmail
    ? `<p class="connect-lead"><strong>${escapeHtml(host.name ?? 'The host')}</strong> sent this link to <strong>${escapeHtml(customerEmail)}</strong>.</p>`
    : ''

  const supportLine = host.supportEmail
    ? `Need help? Contact <a href="mailto:${escapeAttr(host.supportEmail)}">${escapeHtml(host.supportEmail)}</a>.`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect — ${escapeHtml(titleName(host))}</title>
  ${BASE_HEAD}
  ${brandingHead(host)}
  ${SHARED_STYLES}
</head>
<body>
  ${brandHeader(host)}
  <main class="connect-shell">
    <h1 class="connect-h1">Connect an account</h1>
    ${customerLine}
    ${flash ? `<div class="alert alert--danger" style="margin-bottom: var(--space-4);">${escapeHtml(flash)}</div>` : ''}

    <div class="connect-card">
      ${
        showSelfRegister
          ? `
        <p class="connect-lead">Tell us who you are to get started.</p>
        <form id="self-register-form" class="connect-form" novalidate>
          <label class="form-row">
            <span class="form-label">Your email</span>
            <input class="form-control" name="email" type="email" required autocomplete="email" placeholder="you@example.com">
          </label>
          <label class="form-row">
            <span class="form-label">Your name <span class="form-hint">(optional)</span></span>
            <input class="form-control" name="displayName" type="text" autocomplete="name">
          </label>
          <div class="connect-cta">
            <button type="submit" class="btn btn--primary">Continue</button>
          </div>
          <div id="self-register-error" class="alert alert--danger" role="alert" style="display: none; margin-top: var(--space-3);"></div>
        </form>
      `
          : `
        ${
          verticals.length > 1
            ? `
          <div class="vertical-tabs" role="group" aria-label="Vertical">
            ${verticals
              .map(
                (v) => `
              <button type="button" data-vertical="${escapeAttr(v)}" aria-pressed="${v === initialVertical}">${escapeHtml(vLabel(v))}</button>
            `,
              )
              .join('')}
          </div>
        `
            : ''
        }
        <div class="adapter-grid" id="adapter-grid"></div>
        <div id="credential-form-mount"></div>
        <div class="connect-cta">
          <button type="button" class="btn btn--primary" id="connect-button" disabled>Connect</button>
        </div>
      `
      }
    </div>

    <p class="footer-note">${supportLine}</p>
  </main>

  <script${scriptNonce}>
    (function () {
      const TOKEN = ${jsonForScript(token)};
      const CATALOG = ${jsonForScript(catalog)};
      const PRESELECT = ${jsonForScript(preselect ?? null)};

      // Self-register branch: when the link allows self-registration and no
      // customer is yet attached, the page renders an email form in place of
      // the catalog. On submit we POST the customer, then reload — the next
      // render shows the picker.
      const selfRegForm = document.getElementById('self-register-form');
      if (selfRegForm) {
        const errBox = document.getElementById('self-register-error');
        selfRegForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          errBox.style.display = 'none';
          const fd = new FormData(selfRegForm);
          const email = String(fd.get('email') || '').trim();
          const displayName = String(fd.get('displayName') || '').trim();
          if (!email) {
            errBox.textContent = 'Email is required.';
            errBox.style.display = 'block';
            return;
          }
          const submitBtn = selfRegForm.querySelector('button[type=submit]');
          if (submitBtn) submitBtn.disabled = true;
          try {
            const res = await fetch('/connect/' + encodeURIComponent(TOKEN) + '/customer', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, displayName: displayName || undefined }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              errBox.textContent = (body && body.error && body.error.message) || 'Could not register. Try again.';
              errBox.style.display = 'block';
              if (submitBtn) submitBtn.disabled = false;
              return;
            }
            window.location.reload();
          } catch (err) {
            errBox.textContent = 'Network error. Try again.';
            errBox.style.display = 'block';
            if (submitBtn) submitBtn.disabled = false;
          }
        });
        return; // skip the rest of the catalog wiring while in self-register state
      }

      const verticals = Array.from(new Set(CATALOG.map(c => c.vertical))).sort();
      let activeVertical = (PRESELECT && PRESELECT.vertical) || verticals[0] || null;
      let selected = PRESELECT ? CATALOG.find(c => c.vertical === PRESELECT.vertical && c.slug === PRESELECT.platform) || null : null;

      const grid = document.getElementById('adapter-grid');
      const formMount = document.getElementById('credential-form-mount');
      const cta = document.getElementById('connect-button');

      function tileClass(c) {
        const cls = ${jsonForScript(VERTICAL_TILE_CLASS)};
        return 'vtile vtile--lg ' + (cls[c.vertical] || '');
      }

      function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

      function renderAdapterCard(c) {
        const initials = c.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || c.slug.slice(0, 2).toUpperCase();
        const pressed = selected && selected.vertical === c.vertical && selected.slug === c.slug;
        return '<button type="button" class="adapter-card" data-slug="' + c.slug + '" data-vertical="' + c.vertical + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">' +
          '<span class="' + tileClass(c) + '">' + escapeHtml(initials) + '</span>' +
          '<div><div class="adapter-card__name">' + escapeHtml(c.name) + '</div><div class="adapter-card__meta">' + (c.oauth ? 'OAuth' : 'Direct credentials') + '</div></div>' +
          '</button>';
      }

      function renderGrid() {
        const filtered = activeVertical ? CATALOG.filter(c => c.vertical === activeVertical) : CATALOG;
        grid.innerHTML = filtered.map(renderAdapterCard).join('') || '<div class="alert">No integrations are available yet. Ask the team that sent you this link to enable a platform.</div>';
        grid.querySelectorAll('.adapter-card').forEach(b => {
          b.addEventListener('click', () => {
            selected = filtered.find(c => c.slug === b.dataset.slug && c.vertical === b.dataset.vertical) || null;
            renderGrid();
            renderForm();
            updateCta();
          });
        });
      }

      function renderForm() {
        // OAuth tiles render the adapter's oauthFields — the per-customer host it
        // needs before it can redirect (Shopify's store). Direct-credential tiles
        // render credentialFields. Same markup either way.
        const schema = selected ? (selected.oauth ? selected.oauthFields : selected.credentialFields) : null;
        if (!schema || schema.length === 0) {
          formMount.innerHTML = '';
          return;
        }
        const fields = schema.map(f => {
          const inputType = f.type === 'password' ? 'password' : (f.type === 'email' ? 'email' : (f.type === 'url' ? 'url' : 'text'));
          return '<label class="field"><span class="field__label">' + escapeHtml(f.label) + (f.required ? ' *' : '') + '</span>' +
            '<input class="input" name="' + f.name + '" type="' + inputType + '"' + (f.required ? ' required' : '') +
            (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') + '>' +
            (f.helpText ? '<span class="field__hint">' + escapeHtml(f.helpText) + '</span>' : '') +
            '</label>';
        }).join('');
        formMount.innerHTML = '<div class="field-group">' + fields + '</div>';
      }

      function updateCta() {
        cta.disabled = !selected;
        cta.textContent = selected
          ? (selected.oauth ? ('Connect ' + selected.name) : 'Submit credentials')
          : 'Connect';
      }

      function gatherFields() {
        const inputs = formMount.querySelectorAll('input');
        const out = {};
        inputs.forEach(i => { out[i.name] = i.value; });
        return out;
      }

      cta.addEventListener('click', async () => {
        if (!selected) return;
        cta.disabled = true;
        try {
          if (selected.oauth) {
            // A blank required oauthField is caught here as the fast path; the
            // server enforces the same rule and answers MISSING_OAUTH_FIELDS.
            const invalid = formMount.querySelector('input:invalid');
            if (invalid) { invalid.reportValidity(); cta.disabled = false; return; }
            const res = await fetch('/connect/sessions/' + TOKEN + '/oauth-start', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ vertical: selected.vertical, platform: selected.slug, fields: gatherFields() }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error?.message || 'Failed to start OAuth.');
            window.location.href = body.data.redirectUrl;
          } else {
            const res = await fetch('/connect/sessions/' + TOKEN + '/credentials', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ vertical: selected.vertical, platform: selected.slug, fields: gatherFields() }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error?.message || 'Failed to save credentials.');
            window.location.href = (body.data && body.data.redirect) || ('/connect/' + TOKEN + '/done');
          }
        } catch (err) {
          alert(err.message || String(err));
          cta.disabled = false;
        }
      });

      // Vertical tab clicks
      document.querySelectorAll('.vertical-tabs button').forEach(b => {
        b.addEventListener('click', () => {
          activeVertical = b.dataset.vertical;
          document.querySelectorAll('.vertical-tabs button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
          selected = null;
          renderGrid();
          renderForm();
          updateCta();
        });
      });

      renderGrid();
      renderForm();
      updateCta();
    })();
  </script>
</body>
</html>`
}

/**
 * What to call the customer on the thank-you page, or `null` when nothing is
 * known and the greeting should be dropped entirely.
 *
 * Order reflects where a name actually comes from. `pii.firstName` exists when
 * the customer was created through the admin or API with PII. `displayName` is
 * the only name a self-registered customer has — the Connect page's own
 * sign-up step (`POST /connect/:token/customer`) collects email and
 * displayName and nothing else — so its first word is the fallback.
 *
 * The email is a last resort and is used WHOLE. Greeting someone with
 * `email.split('@')[0]` produced "All set, jane.q.doe.", which is a
 * username, not a name; the full address at least reads as an address.
 */
export function greetingName(customer: {
  firstName?: string | null
  displayName?: string | null
  email?: string | null
}): string | null {
  const first = customer.firstName?.trim()
  if (first) return first

  // Split on any whitespace run so a padded or double-spaced displayName still
  // yields a word rather than an empty string.
  const display = customer.displayName?.trim()
  if (display) {
    const word = display.split(/\s+/)[0]
    if (word) return word
  }

  const email = customer.email?.trim()
  return email || null
}

export function thankYouHtml(args: {
  host: HostBranding
  platform: string
  vertical: string
  connectionId: string | null
  consumedAtISO: string
  customerEmail: string | null
  customerFirstName?: string | null
  customerDisplayName?: string | null
}): string {
  const { host, platform, vertical, connectionId, consumedAtISO, customerEmail } = args
  const greeting = greetingName({
    firstName: args.customerFirstName,
    displayName: args.customerDisplayName,
    email: customerEmail,
  })
  const supportLine = host.supportEmail
    ? `<p class="footer-note">Managed by <strong>${escapeHtml(host.name ?? 'the host')}</strong> — to revoke this connection, contact <a href="mailto:${escapeAttr(host.supportEmail)}">${escapeHtml(host.supportEmail)}</a>.</p>`
    : `<p class="footer-note">This connection is managed by <strong>${escapeHtml(host.name ?? 'the host')}</strong>.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connected — ${escapeHtml(titleName(host))}</title>
  ${BASE_HEAD}
  ${brandingHead(host)}
  ${SHARED_STYLES}
</head>
<body>
  ${brandHeader(host)}
  <main class="connect-shell">
    <div class="eyebrow">Connected</div>
    <h1 class="connect-h1">All set${greeting ? ', ' + escapeHtml(greeting) : ''}.</h1>
    <p class="connect-lead">Your <strong>${escapeHtml(vLabel(vertical))}</strong> · <strong>${escapeHtml(platform)}</strong> account is now connected. ${escapeHtml(host.name ?? 'The host')} will start syncing data right away.</p>
    <div class="connect-card">
      <div class="alert alert--info">
        Connection completed at ${escapeHtml(new Date(consumedAtISO).toLocaleString())}${connectionId ? ' · reference <code>' + escapeHtml(connectionId.slice(0, 8)) + '</code>' : ''}.
      </div>
    </div>
    ${supportLine}
  </main>
</body>
</html>`
}

export function errorHtml(args: {
  host: HostBranding
  status: number
  title: string
  body: string
}): string {
  const { host, status, title, body } = args
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${status} — ${escapeHtml(titleName(host))}</title>
  ${BASE_HEAD}
  ${brandingHead(host)}
  ${SHARED_STYLES}
</head>
<body>
  ${brandHeader(host)}
  <main class="connect-shell">
    <div class="eyebrow">${status}</div>
    <h1 class="connect-h1">${escapeHtml(title)}</h1>
    <p class="connect-lead">${escapeHtml(body)}</p>
    ${host.supportEmail ? `<p class="footer-note">Need a new link? Contact <a href="mailto:${escapeAttr(host.supportEmail)}">${escapeHtml(host.supportEmail)}</a>.</p>` : ''}
  </main>
</body>
</html>`
}
