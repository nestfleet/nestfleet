# NestFleet Fleet Module — Commercial License

Copyright (C) 2024–2026 NestFleet. All rights reserved.

The files under `src/fleet/` in this repository are **not** covered by the
AGPL-3.0 license that applies to the rest of this codebase.

## Terms

1. **No redistribution.** You may not distribute, sublicense, or sell copies
   of the Fleet Module code or compiled binaries derived from it.

2. **No modification for redistribution.** You may modify these files for
   your own deployment purposes, but you may not distribute your modifications.

3. **Operator key required.** Production use of the Fleet Module requires a
   valid `NESTFLEET_OPERATOR_KEY` JWT issued by NestFleet. Self-issued keys
   will fail signature verification.

4. **No reverse engineering.** You may not reverse engineer, decompile, or
   disassemble the Fleet Module for the purpose of circumventing the operator
   key gate.

## What is the Fleet Module?

The Fleet Module (`src/fleet/`) implements managed-hosting features:

- **Provisioning** (`src/fleet/provisioning/`) — automated VPS provisioning on
  Hetzner Cloud with Cloudflare DNS management.
- **Fleet API** (`src/fleet/api/`) — owner console endpoints for fleet
  management, license reissue, and revenue analytics.
- **Fleet Workers** (`src/fleet/workers/`) — background jobs for provisioning,
  deprovisioning, health monitoring, and license reissue.
- **Fleet Billing** (`src/fleet/billing/`) — Stripe webhook handlers for
  managed-hosting checkout and subscription lifecycle.
- **Operator Key** (`src/fleet/operator-key.ts`) — Ed25519 JWT gate that
  verifies the operator is licensed to run the Fleet Module.

## Community / Self-Hosted Mode

The remainder of NestFleet (everything outside `src/fleet/`) is released under
[AGPL-3.0-or-later](./LICENSE) and is free to use, modify, and redistribute
under the terms of that license.

Community deployments operate in a reduced feature set without the Fleet Module.
All core product operations features remain available.

## Disclaimer of Warranty

THE FLEET MODULE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL NESTFLEET OR ITS
CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH
THE FLEET MODULE OR THE USE OR OTHER DEALINGS IN THE FLEET MODULE.

## Contact

To obtain a commercial license or an operator key, contact:

  **licensing@nestfleet.dev**
