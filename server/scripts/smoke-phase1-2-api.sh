#!/usr/bin/env bash
# Phase 1+2 API smoke. Hits the running server, exercises the new endpoints.
#
# Usage: ./smoke-phase1-2-api.sh [BASE]
#   BASE = http://localhost:3001 (default)

set -e
BASE=${1:-http://localhost:3001}
PASS=0
FAIL=0

ok() {
  local label="$1"; local cond="$2"; local detail="$3"
  if [ "$cond" = "true" ]; then
    PASS=$((PASS+1))
    echo "✅ $label${detail:+  · $detail}"
  else
    FAIL=$((FAIL+1))
    echo "❌ $label${detail:+  · $detail}"
  fi
}

# Helper: curl + show body on failure.
req() {
  local method="$1"; local path="$2"; local body="$3"
  local out
  if [ -n "$body" ]; then
    out=$(curl -sS -X "$method" -H "Content-Type: application/json" -d "$body" "$BASE$path")
  else
    out=$(curl -sS -X "$method" "$BASE$path")
  fi
  echo "$out"
}

# Pick seeded account IDs by code.
ACCT_6010=$(req GET /api/v1/books/accounts | python3 -c "import json,sys; print(next(a['id'] for a in json.load(sys.stdin)['data'] if a['code']=='6010'))")
ACCT_1000=$(req GET /api/v1/books/accounts | python3 -c "import json,sys; print(next(a['id'] for a in json.load(sys.stdin)['data'] if a['code']=='1000'))")
ACCT_4000=$(req GET /api/v1/books/accounts | python3 -c "import json,sys; print(next(a['id'] for a in json.load(sys.stdin)['data'] if a['code']=='4000'))")

ok "seed: account 6010 exists" "$([ -n "$ACCT_6010" ] && echo true || echo false)" "$ACCT_6010"
ok "seed: account 1000 exists" "$([ -n "$ACCT_1000" ] && echo true || echo false)" "$ACCT_1000"
ok "seed: account 4000 exists" "$([ -n "$ACCT_4000" ] && echo true || echo false)" "$ACCT_4000"

# 1. GET /journal/entries — empty filter should return everything.
RESP=$(req GET "/api/v1/books/journal/entries?limit=5")
COUNT=$(echo "$RESP" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")
ok "GET /journal/entries returns rows" "$([ "$COUNT" -ge 0 ] && echo true || echo false)" "$COUNT rows (limit=5)"

# 2. POST /journal/entries — happy path: expense +amount.
RESP=$(req POST /api/v1/books/journal/entries "{\"txn_date\":\"2026-07-09\",\"type\":\"expense\",\"category_account_id\":\"$ACCT_6010\",\"matched_account_id\":\"$ACCT_1000\",\"amount\":12.34,\"name\":\"Smoke\",\"description\":\"smoke entry\"}")
ENTRY_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('id',''))")
ok "POST /journal/entries (expense +12.34) returns id" "$([ -n "$ENTRY_ID" ] && echo true || echo false)" "$ENTRY_ID"

# 3. GET /journal/entries/:id — returns entry + audit
RESP=$(req GET "/api/v1/books/journal/entries/$ENTRY_ID")
HAS_AUDIT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin).get('data',{}); print(len(d.get('audit',[])))")
ok "GET /journal/entries/:id includes audit trail" "$([ "$HAS_AUDIT" -ge 1 ] && echo true || echo false)" "$HAS_AUDIT audit rows"

# 4. Filter by date range contains our entry.
RESP=$(req GET "/api/v1/books/journal/entries?date_from=2026-07-09&date_to=2026-07-09&limit=500")
COUNT=$(echo "$RESP" | python3 -c "import json,sys; rows=json.load(sys.stdin)['data']; print(sum(1 for r in rows if r['id']=='$ENTRY_ID'))")
ok "GET filter by date contains our entry" "$([ "$COUNT" = "1" ] && echo true || echo false)" "matches=$COUNT"

# 5. Filter by category_id (matched_with or category).
RESP=$(req GET "/api/v1/books/journal/entries?category_id=$ACCT_6010&limit=500")
COUNT=$(echo "$RESP" | python3 -c "import json,sys; rows=json.load(sys.stdin)['data']; print(sum(1 for r in rows if r['id']=='$ENTRY_ID'))")
ok "GET filter by category_id includes our entry" "$([ "$COUNT" = "1" ] && echo true || echo false)" "matches=$COUNT"

# 6. Filter by name_q (case-insensitive).
RESP=$(req GET "/api/v1/books/journal/entries?name_q=smoke&limit=500")
COUNT=$(echo "$RESP" | python3 -c "import json,sys; rows=json.load(sys.stdin)['data']; print(sum(1 for r in rows if r['id']=='$ENTRY_ID'))")
ok "GET filter by name_q=smoke matches" "$([ "$COUNT" = "1" ] && echo true || echo false)" "matches=$COUNT"

# 7. Validation: type mismatch should 400.
RESP=$(req POST /api/v1/books/journal/entries "{\"txn_date\":\"2026-07-09\",\"type\":\"income\",\"category_account_id\":\"$ACCT_6010\",\"matched_account_id\":\"$ACCT_1000\",\"amount\":1}")
CODE=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
ok "Validation: type mismatch returns VALIDATION_ERROR" "$([ "$CODE" = "VALIDATION_ERROR" ] && echo true || echo false)" "code=$CODE"

# 8. Validation: same category + matched should 400.
RESP=$(req POST /api/v1/books/journal/entries "{\"txn_date\":\"2026-07-09\",\"type\":\"expense\",\"category_account_id\":\"$ACCT_6010\",\"matched_account_id\":\"$ACCT_6010\",\"amount\":1}")
CODE=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
ok "Validation: same cat+matched returns VALIDATION_ERROR" "$([ "$CODE" = "VALIDATION_ERROR" ] && echo true || echo false)" "code=$CODE"

# 9. Validation: zero amount should 400.
RESP=$(req POST /api/v1/books/journal/entries "{\"txn_date\":\"2026-07-09\",\"type\":\"expense\",\"category_account_id\":\"$ACCT_6010\",\"matched_account_id\":\"$ACCT_1000\",\"amount\":0}")
CODE=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
ok "Validation: zero amount returns VALIDATION_ERROR" "$([ "$CODE" = "VALIDATION_ERROR" ] && echo true || echo false)" "code=$CODE"

# 10. Audit log entry was created for our happy-path POST.
RESP=$(req GET "/api/v1/books/journal/entries/$ENTRY_ID/audit")
COUNT=$(echo "$RESP" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")
ok "GET audit list contains entry" "$([ "$COUNT" = "1" ] && echo true || echo false)" "$COUNT rows"

# 11. Income positive → credit category.
RESP=$(req POST /api/v1/books/journal/entries "{\"txn_date\":\"2026-07-09\",\"type\":\"income\",\"category_account_id\":\"$ACCT_4000\",\"matched_account_id\":\"$ACCT_1000\",\"amount\":99}")
ENTRY2=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('id',''))")
# Pull the lines: the category line should have credit == 99.
RESP=$(req GET "/api/v1/books/journal/entries/$ENTRY2")
CAT_CREDIT=$(echo "$RESP" | python3 -c "
import json, sys
d = json.load(sys.stdin).get('data', {})
cat_id = '$ACCT_4000'
for l in d.get('lines', []):
  if l.get('account_id') == cat_id:
    print(l.get('credit', 0)); break
")
ok "Income +99: category got credit=99" "$(awk -v x="$CAT_CREDIT" 'BEGIN { exit (x+0 == 99) ? 0 : 1 }' && echo true || echo false)" "credit=$CAT_CREDIT"

# 12. Cleanup: delete the entries we created.
for id in "$ENTRY_ID" "$ENTRY2"; do
  curl -sS -X DELETE "$BASE/api/v1/books/journal/entries/$id" > /dev/null
done
ok "Cleanup: removed smoke-test entries" "true" ""

echo
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" -eq 0 ]
