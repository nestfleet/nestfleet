# CG-12: NestFleet Business Source License (BSL) Terms

**Status**: DRAFT — requires review by qualified legal counsel before publication.
**Last updated**: 2026-03-19

---

## 1. License Grant

Subject to the terms of this license, NestFleet GmbH ("Licensor") grants you ("Licensee") a non-exclusive, non-transferable license to use, copy, modify, and deploy the NestFleet software ("Software") under the following conditions.

## 2. Business Source License Model

The Software is licensed under the Business Source License 1.1 (BSL 1.1) with the following parameters:

| Parameter | Value |
|---|---|
| Licensed Work | NestFleet v1.x |
| Licensor | NestFleet GmbH |
| Change Date | [4 years from initial release — e.g., 2030-03-19] |
| Change License | Apache License 2.0 |
| Additional Use Grant | Production use for internal customer support operations is permitted under all license tiers |

## 3. Permitted Uses

### 3.1 All Tiers
- Deploy NestFleet on your own infrastructure for your own customer support operations
- Modify the source code for your own internal use
- Integrate NestFleet with your existing tools (GitHub, email, Telegram, etc.)

### 3.2 By Tier

| Tier | Products | Features | Support |
|---|---|---|---|
| Trial | 1 | All features, 30 days | Community |
| Starter | 1 | Core features | Community |
| Professional | Up to 10 | All features including SSO, advanced analytics | Email support |
| Enterprise | Unlimited | All features + SCIM, audit log export, compliance templates | Priority support + SLA |

## 4. Prohibited Uses

The following uses are prohibited under all tiers:
- **Competing hosted service**: offering NestFleet or a substantially similar product as a hosted/SaaS service to third parties
- **Resale**: sublicensing, reselling, or distributing the Software to third parties as a standalone product
- **Prohibited use cases**: as defined in the NestFleet Acceptable Use Policy (CG-11)

## 5. Open Source Conversion

On the Change Date (4 years from initial release), the Software automatically converts to the Apache License 2.0. After this date, all BSL restrictions are lifted.

## 6. Source Code Visibility

The full source code of NestFleet is available for inspection, audit, and modification. This supports:
- Customer security reviews
- Compliance verification
- Internal customization
- Community contributions (under CLA)

## 7. Trial Terms

- Duration: 30 days from first activation
- Features: all features enabled (equivalent to Enterprise tier)
- Products: 1 product limit
- Conversion: must upgrade to a paid tier or cease use after trial expiry
- Data: customer retains full control of their data; no data is transmitted to Licensor during trial

## 8. License Validation

- License keys are validated via the cloud-connection channel (optional)
- Offline operation is supported via JWT-based license files
- License expiry degrades gracefully — update channel disabled, local features continue
- No kill switch — the product never stops operating due to license issues

## 9. Intellectual Property

- The Software is owned by NestFleet GmbH
- Customer modifications remain the customer's property
- Contributions to the upstream project require a Contributor License Agreement (CLA)

## 10. Warranty Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. LICENSOR DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.

## 11. Limitation of Liability

IN NO EVENT SHALL LICENSOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM THE USE OF THE SOFTWARE.

---

**IMPORTANT**: This is an engineering-informed draft of license terms. It must be reviewed by qualified legal counsel specializing in software licensing and open-source law before publication or use in any commercial agreement.
