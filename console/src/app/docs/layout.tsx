// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  // Docs pages manage their own layout via DocsLayout component.
  // This layout just passes children through — no AuthProvider wrapper,
  // docs are publicly accessible without login.
  return <>{children}</>
}
