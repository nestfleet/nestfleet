// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
