/**
 * Outbound email sender — SLICE-01.
 *
 * Wraps nodemailer with the SMTP config from config.ts.
 * If SMTP_HOST is not configured the send is skipped and only logged —
 * allowing the full SLICE-01 flow to be tested without an SMTP server.
 *
 * The full Notification Control Plane (priority, quiet hours, dedup, digest)
 * is SLICE-07. This module provides only basic delivery.
 */

import nodemailer from "nodemailer"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

export interface EmailMessage {
  to:      string
  subject: string
  text:    string
  html?:   string
}

/**
 * Send a transactional email.
 * Best-effort: logs and returns false if SMTP is not configured or delivery fails.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  // ── Resolve transport (SMTP_HOST → Postmark → Resend → skip) ────────────────

  interface SMTPConfig { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }
  let smtpConfig: SMTPConfig | null = null
  let fromAddress: string

  if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
    smtpConfig = {
      host:   config.SMTP_HOST,
      port:   config.SMTP_PORT ?? 587,
      secure: (config.SMTP_PORT ?? 587) === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    }
    fromAddress = config.SMTP_FROM ?? config.SMTP_USER
  } else if (config.POSTMARK_API_KEY) {
    smtpConfig = {
      host:   "smtp.postmarkapp.com",
      port:   587,
      secure: false,
      auth: { user: config.POSTMARK_API_KEY, pass: config.POSTMARK_API_KEY },
    }
    fromAddress = config.SMTP_FROM ?? ""
  } else if (config.RESEND_API_KEY) {
    smtpConfig = {
      host:   "smtp.resend.com",
      port:   465,
      secure: true,
      auth: { user: "resend", pass: config.RESEND_API_KEY },
    }
    fromAddress = config.SMTP_FROM ?? ""
  } else {
    logger.info(
      { to: msg.to, subject: msg.subject },
      "Email transport not configured — skipping (set SMTP_HOST, POSTMARK_API_KEY, or RESEND_API_KEY)",
    )
    return false
  }

  try {
    const transporter = nodemailer.createTransport(smtpConfig!)
    await transporter.sendMail({
      from:    fromAddress,
      to:      msg.to,
      subject: msg.subject,
      text:    msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    })
    logger.info({ to: msg.to, subject: msg.subject }, "Email sent")
    return true
  } catch (err) {
    logger.error({ err, to: msg.to, subject: msg.subject }, "Failed to send email")
    return false
  }
}

/**
 * Notify the operator that a new case has been created.
 * Recipient is derived from product.lead_assignments.support_lead (if present)
 * or falls back to SMTP_FROM.
 */
export async function notifyNewCase(opts: {
  operatorEmail: string
  caseId:        string
  productName:   string
  severity:      string | null
  summary:       string | null
  signalSubject: string
}): Promise<void> {
  const severityBadge = opts.severity ? `[${opts.severity.toUpperCase()}] ` : ""
  const subject = `${severityBadge}New case — ${opts.signalSubject}`

  const text = [
    `A new support case has been created in NestFleet for ${opts.productName}.`,
    ``,
    `Case ID:  ${opts.caseId}`,
    `Severity: ${opts.severity ?? "pending triage"}`,
    `Subject:  ${opts.signalSubject}`,
    opts.summary ? `Summary:  ${opts.summary}` : null,
    ``,
    `Log in to the NestFleet operator console to review and act on this case.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n")

  await sendEmail({ to: opts.operatorEmail, subject, text })
}
