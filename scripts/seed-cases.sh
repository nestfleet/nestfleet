#!/usr/bin/env bash
# seed-cases.sh — inject realistic smoke-test cases into a fresh FREE instance.
#
# Usage:
#   PRODUCT_ID=<slug-or-uuid> API_KEY=<key> ./scripts/seed-cases.sh
#
# Defaults work against the local community instance at localhost:8080.

BASE_URL="${BASE_URL:-http://localhost:8080}"
PRODUCT_ID="${PRODUCT_ID:-}"
API_KEY="${API_KEY:-seed-key-freetest-2026}"

if [ -z "$PRODUCT_ID" ]; then
  echo "Error: PRODUCT_ID environment variable is required"
  exit 1
fi

ENDPOINT="${BASE_URL}/webhooks/external/${PRODUCT_ID}"

post_signal() {
  local label="$1"
  local payload="$2"
  echo ""
  echo "▶ Seeding: ${label}"
  response=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${payload}")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo "  ✅ ${http_code} — $(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("caseId",""))' 2>/dev/null)"
  else
    echo "  ❌ ${http_code} — ${body}"
  fi
}

echo "Seeding cases into ${ENDPOINT}"
echo "========================================"

# 1. Billing — user can't access account after payment
post_signal "Billing: payment charged but no access" \
'{"threadId":"seed-001","senderName":"Alice Nguyen","senderRef":"alice@acme-corp.com","message":"Hi, I was charged $49 yesterday for the Pro plan but my account still shows as Free. I have tried logging out and back in but nothing changed. Can you please fix this urgently? Payment ID: ch_3xyz.","channelContext":{"channel":"email","subject":"Charged but still on Free plan"}}'

# 2. Bug report — production crash with stack trace
post_signal "Bug: NullPointerException on checkout" \
'{"threadId":"seed-002","senderName":"Bob Martinez","senderRef":"bob@startupco.io","message":"Getting a 500 error every time I try to complete checkout. Console shows: TypeError: Cannot read properties of undefined (reading \"price\"). This started happening after your deploy yesterday around 14:00 UTC. Affects 100% of our users. This is a production blocker.","channelContext":{"channel":"email","subject":"Checkout broken after your latest deploy"}}'

# 3. Feature request — API pagination
post_signal "Feature request: API pagination" \
'{"threadId":"seed-003","senderName":"Carol Lee","senderRef":"carol@devtools.dev","message":"Love the product! One thing that would make a huge difference: pagination on the /api/events endpoint. Right now it returns everything and for us that is 50k+ records which times out. Even a simple limit/offset would be a massive help. Happy to test a beta.","channelContext":{"channel":"email","subject":"Feature request: paginate the events API"}}'

# 4. Critical — full outage report
post_signal "Critical: service down for enterprise customer" \
'{"threadId":"seed-004","senderName":"David Kim","senderRef":"david.kim@enterprise-client.com","message":"URGENT: Your service has been completely unresponsive for the last 45 minutes. Our entire support team is blocked. We are on an Enterprise contract with a 99.9% SLA. I need an incident update every 15 minutes and a root cause report within 24 hours. Escalating to your CEO if not resolved in 30 minutes.","channelContext":{"channel":"email","subject":"URGENT: Complete service outage — Enterprise SLA breach"}}'

# 5. General question — integration with Zapier
post_signal "General: how to integrate with Zapier" \
'{"threadId":"seed-005","senderName":"Emma Wilson","senderRef":"emma@smallbiz.com","message":"Hi! Quick question — do you have a Zapier integration or webhook I can use to push new signups from my CRM into your system automatically? I checked the docs but couldn'\''t find anything. Apologies if I missed it!","channelContext":{"channel":"email","subject":"Zapier integration question"}}'

echo ""
echo "========================================"
echo "Done. Check http://localhost:8080 → Queue to see the cases."
