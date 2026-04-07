// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
import { Hono } from "hono"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import { pingDb } from "../infra/db/client.js"
import { getBossState } from "../infra/queue/boss.js"
import { isAppError } from "../shared/errors.js"
import { logger } from "../shared/logger.js"
import { config } from "../shared/config.js"
import { emailWebhookRouter } from "./webhooks/email.js"
import { githubWebhookRouter } from "./webhooks/github.js"
import { contactFormRouter } from "./webhooks/contact-form.js"
import { chatRouter } from "./webhooks/chat.js"
import { stripeWebhookRouter } from "./webhooks/stripe.js"
import { externalWebhookRouter } from "./webhooks/external.js"
import { chatApiRouter } from "./v1/chat.js"
import { authRouter }     from "./v1/auth.js"
import { registerRouter } from "./v1/register.js"
import { casesRouter } from "./v1/cases.js"
import { changeRequestsRouter } from "./v1/change-requests.js"
import { approvalsRouter } from "./v1/approvals.js"
import { prDraftsRouter } from "./v1/pr-drafts.js"
import { lineageRouter } from "./v1/lineage.js"
import { notificationsRouter } from "./v1/notifications.js"
import { settingsRouter } from "./v1/settings.js"
import { setupRouter } from "./v1/setup.js"
import { productMemoryRouter } from "./v1/product-memory.js"
import { usersRouter } from "./v1/users.js"
import { licenseRouter } from "./v1/license.js"
import { billingRouter } from "./v1/billing.js"
import { analyticsRouter } from "./v1/analytics.js"
import { retentionRouter } from "./v1/retention.js"
import { dsarRouter } from "./v1/dsar.js"
import { rolesRouter } from "./v1/roles.js"
import { knowledgeAssetsRouter } from "./v1/knowledge-assets.js"
import { productsRouter } from "./v1/products.js"
import { productEventsRouter } from "./v1/product-events.js"
import { dashboardRouter } from "./v1/dashboard.js"
import { bridgeRouter } from "./v1/bridge.js"
import { saasRouter } from "./v1/saas.js"
import { ownerRouter } from "./v1/owner.js"
import { telemetryRouter } from "./v1/telemetry.js"

// Fail fast: CONSOLE_ORIGIN must be set in production (an empty string silently
// breaks all CORS preflight requests, which is harder to debug than a startup crash).
if (config.NODE_ENV === "production" && !config.CONSOLE_ORIGIN) {
  throw new Error("CONSOLE_ORIGIN must be set in production — required for CORS (SEC-04)")
}

// ── Embeddable contact form widget (DEFERRED-13) ──────────────────────────────
// Self-contained JS served at GET /widget/nestfleet-form.js.
// Usage:
//   <script src="https://YOUR_SERVER/widget/nestfleet-form.js"></script>
//   <div id="nestfleet-contact-form"
//        data-product-id="prod_xxx"
//        data-public-key="cf_pub_xxx"
//        data-api-url="https://YOUR_SERVER"></div>
//
// Future Option C: add data-allowed-origins validation on the server side.

const WIDGET_JS = `(function () {
  var el = document.getElementById('nestfleet-contact-form');
  if (!el) return;
  var productId = el.getAttribute('data-product-id');
  var publicKey = el.getAttribute('data-public-key');
  var apiUrl    = (el.getAttribute('data-api-url') || '').replace(/\\/$/, '');
  if (!productId || !publicKey || !apiUrl) {
    el.innerHTML = '<p style="color:#ef4444">NestFleet: missing data-product-id, data-public-key, or data-api-url.</p>';
    return;
  }
  el.innerHTML = [
    '<style>',
    '#nestfleet-contact-form form { display:flex; flex-direction:column; gap:12px; max-width:480px; font-family:system-ui,sans-serif; }',
    '#nestfleet-contact-form input,#nestfleet-contact-form textarea { padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; outline:none; width:100%; box-sizing:border-box; }',
    '#nestfleet-contact-form input:focus,#nestfleet-contact-form textarea:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.15); }',
    '#nestfleet-contact-form textarea { min-height:120px; resize:vertical; }',
    '#nestfleet-contact-form button { padding:10px 20px; background:#6366f1; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; align-self:flex-start; }',
    '#nestfleet-contact-form button:disabled { opacity:.6; cursor:not-allowed; }',
    '#nestfleet-cf-msg { margin-top:8px; font-size:13px; }',
    '</style>',
    '<form id="nestfleet-cf-form" novalidate>',
    '  <input name="name"    type="text"  placeholder="Your name"    required maxlength="200" />',
    '  <input name="email"   type="email" placeholder="Email address" required maxlength="320" />',
    '  <input name="subject" type="text"  placeholder="Subject"      required maxlength="300" />',
    '  <textarea name="message" placeholder="How can we help?" required maxlength="10000"></textarea>',
    '  <button type="submit" id="nestfleet-cf-btn">Send message</button>',
    '</form>',
    '<div id="nestfleet-cf-msg"></div>',
  ].join('');
  document.getElementById('nestfleet-cf-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var btn  = document.getElementById('nestfleet-cf-btn');
    var msg  = document.getElementById('nestfleet-cf-msg');
    var name    = form.name.value.trim();
    var email   = form.email.value.trim();
    var subject = form.subject.value.trim();
    var message = form.message.value.trim();
    if (!name || !email || !subject || !message) {
      msg.style.color = '#ef4444';
      msg.textContent = 'Please fill in all fields.';
      return;
    }
    btn.disabled   = true;
    btn.textContent = 'Sending…';
    msg.textContent = '';
    fetch(apiUrl + '/webhooks/contact-form/submit/' + encodeURIComponent(productId), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ public_key: publicKey, name: name, email: email, subject: subject, message: message }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        form.style.display    = 'none';
        msg.style.color       = '#16a34a';
        msg.textContent       = 'Thanks! We\\'ll get back to you shortly.';
      } else {
        msg.style.color       = '#ef4444';
        msg.textContent       = data.error || 'Something went wrong. Please try again.';
        btn.disabled          = false;
        btn.textContent       = 'Send message';
      }
    })
    .catch(function () {
      msg.style.color   = '#ef4444';
      msg.textContent   = 'Network error. Please try again.';
      btn.disabled      = false;
      btn.textContent   = 'Send message';
    });
  });
})();`

export const app = new Hono()

// ── Security headers — XSS, clickjacking, MIME sniffing (SEC-07) ─────────────

app.use("*", secureHeaders({
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  xXssProtection: "0",  // modern browsers use CSP; the legacy header can cause issues
  // CORP is set per-route: widget endpoints use "cross-origin", everything else omits it
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
  },
}))

// ── CORS — allow the operator console (port 3002 in dev) ─────────────────────

app.use("/api/*", cors({
  origin: config.NODE_ENV === "production"
    ? config.CONSOLE_ORIGIN!
    : ["http://localhost:3002", "http://127.0.0.1:3002"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}))

// ── CORS — public contact form endpoint (any origin, no credentials) ──────────
// DEFERRED-13: The JS widget is embedded on customer websites with unknown origins.
// Future Option C: restrict to per-product allowedOrigins list.

app.use("/webhooks/contact-form/*", cors({
  origin: "*",
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: false,
}))

// ── CORS — public chat endpoints (any origin, no credentials) ─────────────────
// DEFERRED-05: Chat widget + SSE stream are embedded on customer websites.

app.use("/webhooks/chat/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: false,
}))

// ── Webhooks ──────────────────────────────────────────────────────────────────

app.route("/webhooks/email", emailWebhookRouter)
app.route("/webhooks/github", githubWebhookRouter)
app.route("/webhooks/contact-form", contactFormRouter)
app.route("/webhooks/chat", chatRouter)
app.route("/webhooks/external", externalWebhookRouter)
app.route("/", stripeWebhookRouter)

// ── Product access enforcement (CG-07 / OWASP A01:2021) ─────────────────────
// Enforced inside requireAuth() — checks :productId param against user's JWT productIds claim.
// No separate middleware needed; every requireAuth() call includes the check.

// ── API v1 ────────────────────────────────────────────────────────────────────

app.route("/api/v1", authRouter)
app.route("/api/v1", registerRouter)
app.route("/api/v1", casesRouter)
app.route("/api/v1", approvalsRouter)       // must precede changeRequestsRouter — /pending-approval beats /:crId
app.route("/api/v1", prDraftsRouter)        // must precede changeRequestsRouter — /pr-drafted and /:crId/complete beat /:crId
app.route("/api/v1", changeRequestsRouter)
app.route("/api/v1", lineageRouter)
app.route("/api/v1", notificationsRouter)
app.route("/api/v1", settingsRouter)
app.route("/api/v1", setupRouter)
app.route("/api/v1", productMemoryRouter)
app.route("/api/v1", usersRouter)
app.route("/api/v1", licenseRouter)
app.route("/api/v1", billingRouter)
app.route("/api/v1", analyticsRouter)
app.route("/api/v1", retentionRouter)
app.route("/api/v1", dsarRouter)
app.route("/api/v1", rolesRouter)
app.route("/api/v1", knowledgeAssetsRouter)
app.route("/api/v1", productsRouter)
app.route("/api/v1", productEventsRouter)
app.route("/api/v1", chatApiRouter)
app.route("/api/v1", dashboardRouter)
app.route("/api/v1", bridgeRouter)
app.route("/api/v1/saas",      saasRouter)
app.route("/api/v1/owner",     ownerRouter)
app.route("/api/v1/telemetry", telemetryRouter)

// ── /.well-known/security.txt (NF-PIVOT-09) ──────────────────────────────────

app.get("/.well-known/security.txt", (c) => {
  const body = [
    "Contact: mailto:security@nestfleet.dev",
    `Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z"}`,
    "Policy: https://nestfleet.dev/security",
    "Preferred-Languages: en, de",
    "CSAF: https://nestfleet.dev/.well-known/csaf/provider-metadata.json",
  ].join("\n")
  c.header("Content-Type", "text/plain; charset=utf-8")
  c.header("Cache-Control", "public, max-age=86400")
  return c.body(body)
})

// ── Widget — embeddable contact form JS (DEFERRED-13) ────────────────────────
// GET /widget/nestfleet-form.js

app.get("/widget/nestfleet-form.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8")
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Cross-Origin-Resource-Policy", "cross-origin")
  c.header("Cache-Control", "public, max-age=3600")
  return c.body(WIDGET_JS)
})

// ── Widget — embeddable chat widget JS (DEFERRED-05) ─────────────────────────
// GET /widget/nestfleet-chat.js
//
// Usage:
//   <script src="https://YOUR_SERVER/widget/nestfleet-chat.js"></script>
//   <div id="nestfleet-chat"
//        data-product-id="prod_xxx"
//        data-public-key="ch_pub_xxx"
//        data-api-url="https://YOUR_SERVER"
//        data-color="#6366f1"
//        data-welcome="Hi! How can we help?"></div>

const CHAT_WIDGET_JS = `(function () {
  var el = document.getElementById('nestfleet-chat');
  if (!el) return;
  var productId  = el.getAttribute('data-product-id');
  var publicKey  = el.getAttribute('data-public-key');
  var apiUrl     = (el.getAttribute('data-api-url') || '').replace(/\\/+$/, '');
  var color      = el.getAttribute('data-color') || '#6366f1';
  var welcome    = el.getAttribute('data-welcome') || 'Hi! How can we help?';
  if (!productId || !publicKey || !apiUrl) {
    console.warn('NestFleet chat: missing data-product-id, data-public-key, or data-api-url.');
    return;
  }

  var SESSION_KEY = 'nf_chat_sess_' + productId;
  var sessionId   = localStorage.getItem(SESSION_KEY);
  var isOpen      = false;
  var messages    = [];
  var prefilledName  = '';
  var prefilledEmail = '';
  var evtSource   = null;

  // ── Styles ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#nf-chat-bubble{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:'+color+';color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;z-index:999998;transition:transform .15s;}',
    '#nf-chat-bubble:hover{transform:scale(1.08);}',
    '#nf-chat-window{position:fixed;bottom:88px;right:24px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 104px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);z-index:999997;display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;}',
    '#nf-chat-window.open{display:flex;}',
    '#nf-chat-header{background:'+color+';color:#fff;padding:14px 16px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
    '#nf-chat-close{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;opacity:.8;}',
    '#nf-chat-close:hover{opacity:1;}',
    '#nf-chat-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;}',
    '.nf-msg{max-width:80%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.45;word-break:break-word;}',
    '.nf-msg.agent{background:'+color+';color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}',
    '.nf-msg.operator,.nf-msg.system{background:#f1f5f9;color:#1e293b;align-self:flex-start;border-bottom-left-radius:4px;}',
    '#nf-chat-footer{padding:10px;border-top:1px solid #e2e8f0;flex-shrink:0;}',
    '#nf-chat-input-row{display:flex;gap:8px;}',
    '#nf-chat-input{flex:1;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;resize:none;max-height:80px;}',
    '#nf-chat-input:focus{border-color:'+color+';box-shadow:0 0 0 3px '+color+'30;}',
    '#nf-chat-send{padding:9px 14px;background:'+color+';color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;}',
    '#nf-chat-send:disabled{opacity:.5;cursor:not-allowed;}',
    '#nf-chat-prechat{padding:16px;display:flex;flex-direction:column;gap:10px;}',
    '.nf-prechat-input{padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;width:100%;box-sizing:border-box;}',
    '.nf-prechat-input:focus{border-color:'+color+';box-shadow:0 0 0 3px '+color+'30;}',
    '#nf-chat-start{padding:10px;background:'+color+';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%;}',
    '#nf-chat-start:disabled{opacity:.5;}',
    '#nf-prechat-error{font-size:12px;color:#ef4444;}',
    '#nf-chat-typing{font-size:12px;color:#94a3b8;padding:0 4px;display:none;}',
  ].join('');
  document.head.appendChild(style);

  // ── DOM ───────────────────────────────────────────────────────────────────
  el.innerHTML = [
    '<button id="nf-chat-bubble" aria-label="Open chat">',
    '  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>',
    '</button>',
    '<div id="nf-chat-window" role="dialog" aria-label="Support chat">',
    '  <div id="nf-chat-header">',
    '    <span>Support</span>',
    '    <button id="nf-chat-close" aria-label="Close chat">&times;</button>',
    '  </div>',
    '  <div id="nf-chat-body">',
    '    <div class="nf-msg operator">' + welcome + '</div>',
    '  </div>',
    '  <div id="nf-chat-typing">Typing\u2026</div>',
    '  <div id="nf-chat-footer">',
    '    <div id="nf-chat-prechat">',
    '      <input class="nf-prechat-input" id="nf-prechat-name" type="text" placeholder="Your name" maxlength="200" autocomplete="name" />',
    '      <input class="nf-prechat-input" id="nf-prechat-email" type="email" placeholder="Email address" maxlength="320" autocomplete="email" />',
    '      <div id="nf-prechat-error"></div>',
    '      <button id="nf-chat-start">Start chat</button>',
    '    </div>',
    '    <div id="nf-chat-input-row" style="display:none">',
    '      <textarea id="nf-chat-input" rows="1" placeholder="Type a message\u2026" maxlength="4000"></textarea>',
    '      <button id="nf-chat-send">Send</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('');

  var bubble   = document.getElementById('nf-chat-bubble');
  var win      = document.getElementById('nf-chat-window');
  var body     = document.getElementById('nf-chat-body');
  var prechat  = document.getElementById('nf-chat-prechat');
  var inputRow = document.getElementById('nf-chat-input-row');
  var input    = document.getElementById('nf-chat-input');
  var send     = document.getElementById('nf-chat-send');
  var typing   = document.getElementById('nf-chat-typing');

  function appendMsg(role, text) {
    var div = document.createElement('div');
    div.className = 'nf-msg ' + role;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function showChat() {
    if (sessionId) {
      prechat.style.display  = 'none';
      inputRow.style.display = 'flex';
      connectSSE();
    }
  }

  function connectSSE() {
    if (evtSource) return;
    try {
      evtSource = new EventSource(apiUrl + '/webhooks/chat/stream/' + encodeURIComponent(productId) + '/' + encodeURIComponent(sessionId));
      evtSource.addEventListener('chat', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'message' && data.role && data.text) {
            if (data.role !== 'agent') {
              appendMsg(data.role, data.text);
            }
          } else if (data.type === 'typing') {
            typing.style.display = 'block';
            setTimeout(function () { typing.style.display = 'none'; }, 2000);
          }
        } catch (_) {}
      });
      evtSource.onerror = function () {
        evtSource.close();
        evtSource = null;
        setTimeout(function () { if (isOpen && sessionId) connectSSE(); }, 5000);
      };
    } catch (_) {}
  }

  bubble.addEventListener('click', function () {
    isOpen = !isOpen;
    if (isOpen) {
      win.classList.add('open');
      showChat();
    } else {
      win.classList.remove('open');
    }
  });

  document.getElementById('nf-chat-close').addEventListener('click', function () {
    isOpen = false;
    win.classList.remove('open');
  });

  document.getElementById('nf-chat-start').addEventListener('click', function () {
    var nameEl  = document.getElementById('nf-prechat-name');
    var emailEl = document.getElementById('nf-prechat-email');
    var errEl   = document.getElementById('nf-prechat-error');
    var name  = nameEl.value.trim();
    var email = emailEl.value.trim();
    if (!name) { errEl.textContent = 'Please enter your name.'; return; }
    if (!email || !/^[^@]+@[^@]+\\.[^@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email.'; return; }
    errEl.textContent = '';
    prefilledName  = name;
    prefilledEmail = email;
    var msg = 'Hi, I need some help.';
    var btn = document.getElementById('nf-chat-start');
    btn.disabled = true;
    btn.textContent = 'Connecting\u2026';
    fetch(apiUrl + '/webhooks/chat/message/' + encodeURIComponent(productId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: publicKey, name: name, email: email, message: msg }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok && data.session_id) {
        sessionId = data.session_id;
        localStorage.setItem(SESSION_KEY, sessionId);
        prechat.style.display  = 'none';
        inputRow.style.display = 'flex';
        appendMsg('agent', msg);
        connectSSE();
        input.focus();
      } else {
        errEl.textContent = data.error || 'Could not connect. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Start chat';
      }
    })
    .catch(function () {
      errEl.textContent = 'Network error. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Start chat';
    });
  });

  // CHAT-UX-01: Called when the server returns session_closed: true (409).
  // Clears the stored session, hides the input, and shows a restart CTA.
  function onSessionClosed() {
    localStorage.removeItem(SESSION_KEY);
    sessionId = null;
    if (evtSource) { evtSource.close(); evtSource = null; }
    inputRow.style.display = 'none';
    var notice = document.createElement('div');
    notice.className = 'nf-msg system';
    notice.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    var msg = document.createElement('span');
    msg.textContent = 'This conversation has ended.';
    var btn = document.createElement('button');
    btn.textContent = 'Start a new chat \u2192';
    btn.style.cssText = 'background:' + color + ';color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;align-self:flex-start;';
    btn.addEventListener('click', function() {
      notice.remove();
      prefilledName = '';
      prefilledEmail = '';
      // Clear all messages except the welcome bubble (first child)
      while (body.children.length > 1) { body.removeChild(body.lastChild); }
      // Reset pre-chat form
      document.getElementById('nf-prechat-name').value = '';
      document.getElementById('nf-prechat-email').value = '';
      document.getElementById('nf-prechat-error').textContent = '';
      var startBtn = document.getElementById('nf-chat-start');
      startBtn.disabled = false;
      startBtn.textContent = 'Start chat';
      prechat.style.display = '';
    });
    notice.appendChild(msg);
    notice.appendChild(btn);
    body.appendChild(notice);
    body.scrollTop = body.scrollHeight;
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text || !sessionId) return;
    input.value = '';
    input.style.height = '';
    send.disabled = true;
    appendMsg('agent', text);
    fetch(apiUrl + '/webhooks/chat/message/' + encodeURIComponent(productId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: publicKey, session_id: sessionId, name: prefilledName, email: prefilledEmail, message: text }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      send.disabled = false;
      if (!data.ok) {
        if (data.session_closed) { onSessionClosed(); }
        else { appendMsg('system', data.error || 'Message failed. Please try again.'); }
      }
    })
    .catch(function () {
      send.disabled = false;
      appendMsg('system', 'Network error. Please try again.');
    });
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', function () {
    this.style.height = '';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });

  // Auto-open SSE if returning visitor
  if (sessionId) showChat();
})();`

app.get("/widget/nestfleet-chat.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8")
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Cross-Origin-Resource-Policy", "cross-origin")
  c.header("Cache-Control", "public, max-age=3600")
  return c.body(CHAT_WIDGET_JS)
})

// ── GET /widget/test/:productId ───────────────────────────────────────────────
// BEF-21: Persistent per-product chat widget test harness.
// Renders a self-contained HTML page with the product's chat public key injected.
// No manual setup required — browse to /widget/test/<productId> to test any product.

app.get("/widget/test/:productId", async (c) => {
  const productId = c.req.param("productId")
  const { findProductById } = await import("../infra/db/repositories/products.js")
  const product = await findProductById(productId)
  if (!product) {
    return c.text("Product not found", 404)
  }

  const { decryptSecret } = await import("../shared/crypto.js")
  const policy    = (product.support_policy ?? {}) as Record<string, unknown>
  const publicKey = decryptSecret(policy.chatPublicKey as string | undefined) ?? "(not configured)"
  const origin    = new URL(c.req.url).origin

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${product.name} — Chat Widget Test</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 60px auto; padding: 0 24px; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .badge { display: inline-block; background: #10b981; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; margin-left: 8px; vertical-align: middle; }
    .info { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 13px; line-height: 1.7; }
    .info code { background: #dcfce7; padding: 1px 5px; border-radius: 4px; font-family: monospace; }
    .warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #92400e; }
    p { color: #4b5563; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${product.name} <span class="badge">Widget Test</span></h1>
  <p>Persistent chat widget test harness for <strong>${product.name}</strong>. The chat bubble should appear in the bottom-right corner.</p>

  <div class="info">
    <strong>Product:</strong> <code>${product.name}</code><br/>
    <strong>Product ID:</strong> <code>${productId}</code><br/>
    <strong>Public key:</strong> <code>${publicKey}</code><br/>
    <strong>API origin:</strong> <code>${origin}</code>
  </div>

  ${publicKey === "(not configured)" ? '<div class="warn">⚠️ No chat public key configured for this product. Go to Settings → Chat Widget to generate one.</div>' : ""}

  <p>Type a message to start a chat session. NestFleet will triage it and auto-reply if confidence gates pass. Reload this page at any time — the test harness is always available at <code>/widget/test/${productId}</code>.</p>

  <div id="nestfleet-chat"
       data-product-id="${productId}"
       data-public-key="${publicKey}"
       data-api-url="${origin}"
       data-color="#6366f1"
       data-welcome="Hi! How can we help with ${product.name}?"></div>
  <script src="${origin}/widget/nestfleet-chat.js"></script>
</body>
</html>`

  c.header("Content-Type", "text/html; charset=utf-8")
  c.header("Cache-Control", "no-store")
  return c.body(html)
})

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", async (c) => {
  const dbOk = await pingDb()
  const queueState = getBossState()
  const allOk = dbOk && queueState === "started"
  return c.json(
    {
      status: allOk ? "ok" : "degraded",
      service: "nestfleet",
      version: "0.1.0",
      db: dbOk ? "ok" : "error",
      queue: queueState,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  )
})

// ── Global error handler ──────────────────────────────────────────────────────

/** INFRA-02: Detect postgres.js pool-exhaustion / connect-timeout errors. */
function isDbPoolExhausted(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("connect_timeout") || msg.includes("connection_closed")
}

app.onError((err, c) => {
  if (isAppError(err)) {
    logger.warn({ err, code: err.code }, err.message)
    return c.json(err.toJSON(), err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 503)
  }

  // INFRA-02: DB connection pool exhausted → 503 instead of hang/500
  if (isDbPoolExhausted(err)) {
    logger.warn({ event: "db_pool_exhausted", err }, "DB connection pool exhausted")
    return c.json(
      { error: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable. Please try again shortly." },
      503,
    )
  }

  logger.error({ err }, "Unhandled error")
  return c.json(
    { error: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    500,
  )
})

// ── 404 fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json({ error: "NOT_FOUND", message: `Route ${c.req.path} not found` }, 404)
})
