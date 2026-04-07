export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  // Docs pages manage their own layout via DocsLayout component.
  // This layout just passes children through — no AuthProvider wrapper,
  // docs are publicly accessible without login.
  return <>{children}</>
}
