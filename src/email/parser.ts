// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Inbound email parser — SLICE-01.
 *
 * Accepts Postmark inbound webhook format (de-facto standard; also easy to simulate
 * with curl for local testing). Normalises to a provider-agnostic struct.
 *
 * Postmark reference: https://postmarkapp.com/developer/webhooks/inbound-webhook
 */

import { z } from "zod"

// ── Postmark inbound webhook schema ───────────────────────────────────────────

const PostmarkHeaderSchema = z.object({
  Name:  z.string(),
  Value: z.string(),
})

export const PostmarkInboundSchema = z.object({
  MessageID:  z.string(),
  From:       z.string(),                       // "Name <email>" or "email"
  FromName:   z.string().optional().default(""),
  FromFull:   z.object({ Email: z.string(), Name: z.string() }).optional(),
  To:         z.string(),
  Subject:    z.string().default("(no subject)"),
  TextBody:   z.string().optional().default(""),
  HtmlBody:   z.string().optional().default(""),
  ReplyTo:    z.string().optional().default(""),
  Date:       z.string().optional(),
  Headers:    z.array(PostmarkHeaderSchema).optional().default([]),
  Tag:        z.string().optional(),
  Attachments: z.array(z.unknown()).optional().default([]),
})

export type PostmarkInbound = z.infer<typeof PostmarkInboundSchema>

// ── Normalized email struct ───────────────────────────────────────────────────

export interface ParsedEmail {
  /** Globally unique message ID (used as signal source_ref for dedup). */
  messageId:   string
  /** Sender email address (lowercase). */
  fromEmail:   string
  /** Sender display name (may be empty). */
  fromName:    string
  /** Email subject line. */
  subject:     string
  /** Plain-text body (preferred for LLM). */
  bodyText:    string
  /** HTML body (stored for reference). */
  bodyHtml:    string
  /** Reply-To address if present. */
  replyTo:     string
  /** In-Reply-To header value — identifies the parent message for thread linking. */
  inReplyTo:   string | null
  /** References header — full thread chain for conversation dedup. */
  references:  string | null
  /** ISO timestamp the email was received. */
  receivedAt:  Date
  /** Number of attachments. */
  attachmentCount: number
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Postmark inbound webhook payload into a normalised ParsedEmail.
 * Throws ZodError if required fields are missing.
 */
export function parsePostmarkInbound(raw: unknown): ParsedEmail {
  const pm = PostmarkInboundSchema.parse(raw)

  const fromEmail = pm.FromFull?.Email ?? extractEmail(pm.From)
  const fromName  = pm.FromFull?.Name  ?? pm.FromName ?? extractName(pm.From)

  const headers = pm.Headers ?? []
  const getHeader = (name: string) =>
    headers.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? null

  return {
    messageId:       pm.MessageID,
    fromEmail:       fromEmail.toLowerCase().trim(),
    fromName:        fromName.trim(),
    subject:         pm.Subject.trim(),
    bodyText:        pm.TextBody?.trim() ?? "",
    bodyHtml:        pm.HtmlBody?.trim() ?? "",
    replyTo:         pm.ReplyTo?.trim() ?? "",
    inReplyTo:       getHeader("In-Reply-To"),
    references:      getHeader("References"),
    receivedAt:      pm.Date ? new Date(pm.Date) : new Date(),
    attachmentCount: pm.Attachments?.length ?? 0,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract email from "Display Name <email@example.com>" or "email@example.com". */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] ?? from : from.trim()
}

/** Extract display name from "Display Name <email@example.com>". */
function extractName(from: string): string {
  const match = from.match(/^(.+?)\s*</)
  return match ? (match[1] ?? "").replace(/^["']|["']$/g, "").trim() : ""
}

/**
 * Build the signal text sent to the LLM.
 * Combines subject + body text; body is truncated to 3 000 chars for token safety.
 */
export function buildSignalText(email: ParsedEmail): string {
  const body = email.bodyText.slice(0, 3_000)
  return `Subject: ${email.subject}\n\n${body}`
}

/**
 * Derive a conversation thread key from email headers.
 * Uses In-Reply-To / References (first ref) / message-id in priority order.
 * The same thread key across replies keeps them in one Conversation row.
 */
export function deriveThreadKey(email: ParsedEmail): string {
  // If replying to an existing message, use that message's ID as thread root
  if (email.inReplyTo) return email.inReplyTo.trim()
  if (email.references) {
    const first = email.references.trim().split(/\s+/)[0]
    if (first) return first
  }
  // New thread: use the message's own ID
  return email.messageId
}
