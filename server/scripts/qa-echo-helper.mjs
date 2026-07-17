#!/usr/bin/env node
// QA helper: collect account IDs needed for Echo's manual-entry tests, save to /tmp/echo-state.json

import fs from 'node:fs';

const BASE = 'http://localhost:3001/api/v1';

async function jget(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) {
    throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  }
  return r.json();
}

const accounts = await jget('/books/accounts?limit=500');
const list = accounts.data || [];
const by = (type) => list.find((a) => a.account_type === type && a.is_active === 1);

const pick = {
  asset_1000: list.find((a) => a.code === '1000'),
  expense_software: list.find((a) => a.code === '6010'),
  income_wholesale: list.find((a) => a.code === '4000'),
  liability_credit_card: list.find((a) => a.code === '2000'),
  equity_owners: list.find((a) => a.code === '3000'),
  liability_sales_tax: list.find((a) => a.code === '2100'),
};

// Also: count of ECHO-* test entries so we can verify cleanup at end
const beforeCount = await jget('/books/journal/entries?limit=1');
const baseline = beforeCount.meta?.total ?? '?';

const state = {
  base: BASE,
  accounts: {
    asset_1000: pick.asset_1000?.id,
    expense_software: pick.expense_software?.id,
    income_wholesale: pick.income_wholesale?.id,
    liability_credit_card: pick.liability_credit_card?.id,
    equity_owners: pick.equity_owners?.id,
    liability_sales_tax: pick.liability_sales_tax?.id,
  },
  account_names: {
    asset_1000: pick.asset_1000?.name,
    expense_software: pick.expense_software?.name,
    income_wholesale: pick.income_wholesale?.name,
    liability_credit_card: pick.liability_credit_card?.name,
    equity_owners: pick.equity_owners?.name,
    liability_sales_tax: pick.liability_sales_tax?.name,
  },
  totalEntriesBefore: baseline,
};

fs.writeFileSync('/tmp/echo-state.json', JSON.stringify(state, null, 2));
console.log(JSON.stringify(state, null, 2));