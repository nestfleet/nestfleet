import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Roles & Permissions — NestFleet Docs",
  description: "Built-in roles in NestFleet and what each one can do.",
}

export default function RolesPage() {
  return (
    <DocsLayout
      prev={{ label: "Knowledge Base", href: "/docs/user-guide/knowledge-base" }}
      next={{ label: "Notifications", href: "/docs/user-guide/notifications" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Roles & Permissions
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet uses role-based access control (RBAC) with six built-in roles. Each role is
        designed for a specific function within the product operations workflow. Users can hold
        multiple roles simultaneously.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Built-in roles</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[150px]">Role</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Admin", "Full system access. Manages users, roles, products, and system settings. The only role that can assign or remove roles for other users."],
            ["Operator", "Day-to-day case management. Can triage, assign, close, and add notes to cases. Can create change requests from cases."],
            ["Support Lead", "Everything an Operator can do, plus: approve or reject auto-replies, escalate cases, and receive escalation notifications."],
            ["Change Lead", "Approves or rejects change requests. Reviews AI-generated PR drafts and risk assessments. Cannot manage users or system settings."],
            ["Product Lead", "Read access to all cases, change requests, and knowledge base for their product. Can view analytics. Cannot modify cases or approve CRs."],
            ["Knowledge Lead", "Manages the knowledge base. Can create, edit, and delete articles and known issues. Reviews and accepts or rejects auto-update proposals."],
          ].map(([role, purpose]) => (
            <tr key={role}>
              <td className="px-3 py-2 border border-gray-200 align-top font-semibold text-gray-800">{role}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Permission matrix</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The table below shows which roles can perform each action. A checkmark means the role has
        permission; a dash means it does not.
      </p>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 min-w-[220px]">Action</th>
              {["Admin", "Operator", "Support Lead", "Change Lead", "Product Lead", "Knowledge Lead"].map((role) => (
                <th key={role} className="text-center bg-gray-50 px-2 py-2 border border-gray-200 font-semibold text-gray-700 text-xs">{role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Manage users & roles",           true, false, false, false, false, false],
              ["Manage products",                 true, false, false, false, false, false],
              ["Manage system settings",          true, false, false, false, false, false],
              ["View all cases",                  true, true, true, true, true, true],
              ["Triage & assign cases",           true, true, true, false, false, false],
              ["Close cases",                     true, true, true, false, false, false],
              ["Add case notes",                  true, true, true, false, false, false],
              ["Escalate cases",                  true, true, true, false, false, false],
              ["Approve / reject auto-replies",   true, false, true, false, false, false],
              ["Create change requests",          true, true, true, false, false, false],
              ["Approve / reject change requests",true, false, false, true, false, false],
              ["Manage knowledge base articles",  true, false, false, false, false, true],
              ["Review KB update proposals",      true, false, false, false, false, true],
              ["View analytics",                  true, false, true, false, true, false],
              ["View audit log",                  true, false, false, false, false, false],
            ].map(([action, ...perms]) => (
              <tr key={action as string}>
                <td className="px-3 py-2 border border-gray-200 text-gray-700">{action}</td>
                {(perms as boolean[]).map((has, i) => (
                  <td key={i} className="text-center px-2 py-2 border border-gray-200">
                    {has ? (
                      <span className="text-green-600 font-bold">✓</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Role assignment</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Only users with the <strong>Admin</strong> role can assign or remove roles. To manage a user&apos;s roles:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Navigate to <strong>Settings → Team Members</strong></li>
        <li>Click on the user you want to modify</li>
        <li>Select or deselect roles from the role picker</li>
        <li>Click <strong>Save</strong> — changes take effect immediately on the user&apos;s next API request</li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Multiple roles</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        A user can hold multiple roles simultaneously, and their permissions are the union of all their
        assigned roles. For example, a user with both <strong>Support Lead</strong> and <strong>Knowledge Lead</strong> can
        both approve auto-replies and manage the knowledge base.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Common combinations in small teams:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Operator + Knowledge Lead</strong> — a support engineer who also manages documentation</li>
        <li><strong>Support Lead + Change Lead</strong> — a senior engineer handling both approvals</li>
        <li><strong>Admin + Operator</strong> — the system owner who also handles day-to-day cases</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Self-lockout protection</h2>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          An admin cannot remove their own Admin role. If you attempt to do so, the API returns a
          validation error. This prevents accidentally locking yourself (and your team) out of the
          system. To transfer admin access, first grant the Admin role to another user, then ask
          them to remove it from your account.
        </p>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The system also enforces that at least one active user with the Admin role always exists.
        Attempting to delete the last admin account is blocked at the API level.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Inviting new users</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Admins can invite new team members from <strong>Settings → Team Members → Invite</strong>. An invitation
        email is sent with a one-time signup link. When{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">REGISTRATION_ENABLED=false</code> (the default for self-hosted),
        this invitation mechanism is the only way new users can join. The invited user&apos;s role is assigned
        at invitation time.
      </p>
    </DocsLayout>
  )
}
