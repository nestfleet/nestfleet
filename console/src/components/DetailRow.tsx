// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

export function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
