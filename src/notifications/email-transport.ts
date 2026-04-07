/**
 * Email transport for the notification control plane — SLICE-07.
 *
 * Priority order:
 *   1. SMTP_HOST is set → use generic SMTP (host, port, auth from config)
 *   2. POSTMARK_API_KEY is set → use Postmark SMTP relay (smtp.postmarkapp.com:587)
 *   3. Neither set → log info and return false (non-fatal)
 *
 * Best-effort: errors are logged as warn and return false — never throws.
 */

import nodemailer from "nodemailer"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

export interface EmailMessage {
  to:      string
  subject: string
  text:    string
}

/**
 * Send a transactional email using whichever transport is configured.
 * Returns true on successful delivery, false if unconfigured or on error.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  // ── Resolve transport ──────────────────────────────────────────────────────

  if (config.SMTP_HOST) {
    // Generic SMTP path
    return sendViaSMTP(msg, {
      host:   config.SMTP_HOST,
      port:   config.SMTP_PORT ?? 587,
      secure: (config.SMTP_PORT ?? 587) === 465,
      auth: {
        user: config.SMTP_USER ?? "",
        pass: config.SMTP_PASS ?? "",
      },
      from: config.SMTP_FROM ?? config.SMTP_USER ?? "",
    })
  }

  if (config.POSTMARK_API_KEY) {
    // Postmark SMTP relay — API key is used as both user and password
    return sendViaSMTP(msg, {
      host:   "smtp.postmarkapp.com",
      port:   587,
      secure: false,
      auth: {
        user: config.POSTMARK_API_KEY,
        pass: config.POSTMARK_API_KEY,
      },
      from: config.SMTP_FROM ?? "",
    })
  }

  if (config.RESEND_API_KEY) {
    // Resend SMTP relay — user is always "resend", API key is the password
    return sendViaSMTP(msg, {
      host:   "smtp.resend.com",
      port:   465,
      secure: true,
      auth: {
        user: "resend",
        pass: config.RESEND_API_KEY,
      },
      from: config.SMTP_FROM ?? "",
    })
  }

  // None configured
  logger.info(
    { to: msg.to, subject: msg.subject },
    "email transport not configured — skipping delivery",
  )
  return false
}

// ── Internal ───────────────────────────────────────────────────────────────

interface SMTPOptions {
  host:   string
  port:   number
  secure: boolean
  auth:   { user: string; pass: string }
  from:   string
}

async function sendViaSMTP(msg: EmailMessage, opts: SMTPOptions): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host:   opts.host,
      port:   opts.port,
      secure: opts.secure,
      auth: {
        user: opts.auth.user,
        pass: opts.auth.pass,
      },
    })

    await transporter.sendMail({
      from:    opts.from,
      to:      msg.to,
      subject: msg.subject,
      text:    msg.text,
    })

    logger.info({ to: msg.to, subject: msg.subject }, "Email sent")
    return true
  } catch (err) {
    logger.warn({ err, to: msg.to, subject: msg.subject }, "Email delivery failed")
    return false
  }
}
