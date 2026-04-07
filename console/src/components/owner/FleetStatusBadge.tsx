import clsx from "clsx";
import type { ProvisioningStatus } from "@/lib/owner-api";

interface FleetStatusBadgeProps {
  status: ProvisioningStatus;
}

const statusConfig: Record<
  ProvisioningStatus,
  { label: string; className: string; pulse: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-blue-100 text-blue-700 ring-1 ring-blue-300/50",
    pulse: true,
  },
  provisioning: {
    label: "Provisioning",
    className: "bg-blue-100 text-blue-700 ring-1 ring-blue-300/50",
    pulse: true,
  },
  active: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/50",
    pulse: false,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 ring-1 ring-red-300/50",
    pulse: false,
  },
  deprovisioning: {
    label: "Deprovisioning",
    className: "bg-amber-100 text-amber-700 ring-1 ring-amber-300/50",
    pulse: false,
  },
  deprovisioned: {
    label: "Deprovisioned",
    className: "bg-gray-100 text-gray-500 ring-1 ring-gray-300/50",
    pulse: false,
  },
};

export function FleetStatusBadge({ status }: FleetStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-500 ring-1 ring-gray-300/50",
    pulse: false,
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.className
      )}
      aria-label={`Status: ${config.label}`}
    >
      <span
        className={clsx("block h-1.5 w-1.5 rounded-full", {
          "animate-pulse bg-blue-500": config.pulse,
          "bg-current opacity-60": !config.pulse,
        })}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
