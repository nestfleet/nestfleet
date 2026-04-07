/**
 * Transaction helper — SLICE-15.
 *
 * Provides `withTransaction()` that wraps multiple operations in a
 * single PostgreSQL transaction using postgres.js `begin()`.
 *
 * The transaction SQL instance is passed to the callback and MUST be used
 * for all queries within that callback — using the global `getDb()` inside
 * will bypass the transaction boundary.
 */

import postgres from "postgres"
import { getDb } from "./client.js"

/**
 * The transaction SQL type from postgres.js — supports tagged template queries
 * but omits connection-level methods (begin, close, end, etc.).
 *
 * We use postgres.Sql as the type because TransactionSql's Omit-based definition
 * causes issues with the tagged template call signature in strict TS mode.
 * At runtime, the tx object IS a TransactionSql — this is just a type-level workaround.
 */
export type TransactionSql = postgres.Sql

/**
 * Run a callback inside a PostgreSQL transaction.
 *
 * @returns The value returned by the callback.
 * @throws  Rolls back the transaction on any error and re-throws.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionSql) => T | Promise<T>,
): Promise<T> {
  const db = getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.begin(fn as any) as Promise<T>
}
