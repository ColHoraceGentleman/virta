// Virta Books — Phase C: CSV import wizard.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (Pipeline + Mappings).
//
// Three-step wizard:
//   1. File upload — drag-drop or click. POST to /imports (preview, no inserts).
//      Detect source (Chase / AmEx / PayPal / Venmo / generic), suggested mapping.
//   2. Mapping review — dropdowns for date/description/amount if not detected,
//      "Save this mapping" checkbox, source-account picker.
//   3. Import summary — inserted: N, duplicates skipped: M, link to Categorization.

import { useState, useRef, useCallback } from 'react';
import { booksApi } from './api.js';

const STEPS = { UPLOAD: 1, MAPPING: 2, SUMMARY: 3 };

export default function ImportCSV({ navigate }) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);    // response from /imports (preview)
  const [mapping, setMapping] = useState(null);     // {date_col, description_col, amount_col, amount_sign_convention}
  const [saveMapping, setSaveMapping] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [sourceKey, setSourceKey] = useState('');
  const [headerSignature, setHeaderSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);     // final apply response
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  // Load accounts on first render.
  if (accounts.length === 0 && !busy) {
    booksApi.listAccounts().then(setAccounts).catch(e => setError(e.message));
  }

  const handleFile = useCallback(async (f) => {
    setError('');
    if (!f) return;
    const ok =
      f.type === 'text/csv' ||
      f.type === 'application/csv' ||
      f.type === 'application/pdf' ||
      /\.csv$/i.test(f.name) ||
      /\.pdf$/i.test(f.name);
    if (!ok) {
      setError('Only .csv and .pdf files are accepted');
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      const data = await booksApi.uploadImport(f, { apply: false });
      setPreview(data);

      // Resolve the suggested mapping.
      let m = null;
      if (data.suggested_mapping) {
        m = { ...data.suggested_mapping };
      } else if (data.applied_mapping) {
        m = { ...data.applied_mapping };
      } else {
        m = {
          source_key: data.source_key,
          date_col: data.headers?.[0] || '',
          description_col: data.headers?.[1] || '',
          amount_col: data.headers?.[2] || '',
          amount_sign_convention: 'negative_outflow', // Default: standard CC/bank + PayPal/Venmo (positive=inflow kept as-is).
        };
      }
      setMapping(m);
      setSourceKey(data.source_key);
      setHeaderSignature(data.header_signature);

      // Pre-select the account: suggested_mapping has suggested_account_code → look it up.
      if (m.suggested_account_code) {
        const acc = accounts.find(a => a.code === m.suggested_account_code);
        if (acc) setAccountId(acc.id);
      } else if (data.account_id) {
        setAccountId(data.account_id);
      }
      // Step 2 unless source detected AND needs_user_mapping is false AND we have account.
      const ready = !data.needs_user_mapping && !data.needs_account && data.account_id;
      setStep(ready ? STEPS.MAPPING : STEPS.MAPPING);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [accounts]);

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }
  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave() { setDragOver(false); }
  function onPick() { inputRef.current?.click(); }
  function onFileInput(e) { handleFile(e.target.files?.[0]); }

  async function applyImport() {
    if (!file || !mapping) return;
    setBusy(true);
    setError('');
    try {
      const data = await booksApi.applyImport(file, { apply: true, suggested_account_id: accountId });
      setSummary({
        inserted: data.inserted,
        duplicates_skipped: data.duplicates_skipped,
        candidates: data.candidates,
      });
      // Save the mapping if the user opted in.
      if (saveMapping && sourceKey && headerSignature) {
        try {
          await booksApi.saveMapping({
            source_key: sourceKey,
            header_signature: headerSignature,
            mapping: {
              date_col: mapping.date_col,
              description_col: mapping.description_col,
              amount_col: mapping.amount_col,
              amount_sign_convention: mapping.amount_sign_convention,
            },
            memorized_account_id: accountId || null,
          });
        } catch (e) {
          console.warn('Save mapping failed', e);
        }
      }
      setStep(STEPS.SUMMARY);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyWithUserMapping() {
    // Generic CSV path — re-parse the file text on the server with our chosen mapping.
    if (!file || !mapping) return;
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      const data = await booksApi.applyImportWithMapping({
        account_id: accountId,
        source_key: sourceKey,
        header_signature: headerSignature,
        save_mapping: saveMapping,
        mapping: {
          date_col: mapping.date_col,
          description_col: mapping.description_col,
          amount_col: mapping.amount_col,
          amount_sign_convention: mapping.amount_sign_convention,
        },
        rows: (preview?.candidates || []).map(c => c.row),
      });
      setSummary({
        inserted: data.inserted_count,
        duplicates_skipped: data.duplicates_skipped,
        candidates: data.candidates,
      });
      setStep(STEPS.SUMMARY);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(STEPS.UPLOAD);
    setFile(null);
    setPreview(null);
    setMapping(null);
    setSummary(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-light tracking-wide">Import CSV</h2>
        <div className="text-xs text-slate-500">
          Step {step} of 3
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Re-import banner (Dedupe Upgrade 2): shown after /imports response comes back
          if the source has been used before. Surfaces the duplicate skip count more visibly. */}
      {step === STEPS.MAPPING && preview && preview.applied_mapping && preview.applied_mapping.last_used_at && (
        <ReImportBanner
          appliedMapping={preview.applied_mapping}
          candidates={preview.candidates}
        />
      )}

      {step === STEPS.UPLOAD && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onPick}
          className={`flex flex-col items-center justify-center px-8 py-16 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-500'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.pdf"
            onChange={onFileInput}
            className="hidden"
          />
          <div className="text-5xl mb-4">📥</div>
          <p className="text-lg mb-2">Drop a CSV or PDF here</p>
          <p className="text-sm text-slate-500 mb-6">or click to choose a file · max 5MB · max 10,000 rows</p>
          {busy && <p className="text-sm text-slate-400">Analyzing…</p>}
          {file && (
            <p className="mt-4 text-sm text-slate-400">
              Selected: <span className="text-slate-200">{file.name}</span>
            </p>
          )}
          <p className="mt-8 text-xs text-slate-600">
            Supported: Chase CC · AmEx · PayPal · Venmo · generic CSV
          </p>
        </div>
      )}

      {step === STEPS.MAPPING && mapping && (
        <div className="space-y-6">
          <div className="px-4 py-3 bg-slate-800 rounded-lg">
            <div className="text-sm">
              <span className="text-slate-500">Detected source:</span>{' '}
              <span className="font-mono text-indigo-300">{sourceKey || 'generic'}</span>
              {preview?.candidates && (
                <span className="ml-4 text-slate-500">
                  {preview.candidates.length} row{preview.candidates.length === 1 ? '' : 's'}
                  {preview.candidates.some(c => c.dedupe_status === 'duplicate') && (
                    <span className="ml-2 text-amber-400">
                      ({preview.candidates.filter(c => c.dedupe_status === 'duplicate').length} duplicates)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Column mapping (generic only — prebuilt parsers don't expose this) */}
          {preview?.headers && preview.headers.length > 0 && (sourceKey === 'generic' || !preview.applied_mapping) && (
            <div className="space-y-3 px-4 py-3 bg-slate-800/50 rounded-lg">
              <div className="text-sm font-medium">Map CSV columns</div>
              <div className="grid grid-cols-3 gap-3">
                <SelectField
                  label="Date column"
                  headers={preview.headers}
                  value={mapping.date_col}
                  onChange={v => setMapping({ ...mapping, date_col: v })}
                />
                <SelectField
                  label="Description column"
                  headers={preview.headers}
                  value={mapping.description_col}
                  onChange={v => setMapping({ ...mapping, description_col: v })}
                />
                <SelectField
                  label="Amount column"
                  headers={preview.headers}
                  value={mapping.amount_col}
                  onChange={v => setMapping({ ...mapping, amount_col: v })}
                />
              </div>
              <div className="text-xs text-slate-500 pt-1">
                Sign convention:{' '}
                <select
                  value={mapping.amount_sign_convention}
                  onChange={e => setMapping({ ...mapping, amount_sign_convention: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                >
                  <option value="negative_outflow">Negative = outflow (standard CC / bank / PayPal / Venmo)</option>
                  <option value="positive_outflow">Positive = outflow (some bank exports)</option>
                </select>
              </div>
            </div>
          )}

          {/* Source account picker */}
          <div className="px-4 py-3 bg-slate-800/50 rounded-lg">
            <label className="text-sm font-medium block mb-2">Source account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200"
            >
              <option value="">— Choose account —</option>
              {accounts.filter(a => a.account_type === 'asset' || a.account_type === 'liability').map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              This is the bank / CC / PayPal / Venmo account the rows came from.
              Memorized per source: your choice is remembered for next time.
            </p>
            {/* Cross-account guard (Dedupe Upgrade 2): if user is selecting a different
                account than the memorized one for this source, show a soft warning. */}
            {preview?.applied_mapping?.memorized_account_id
              && preview.applied_mapping.memorized_account_id !== accountId
              && accountId !== '' && (
              <CrossAccountGuard
                memorizedAccountId={preview.applied_mapping.memorized_account_id}
                accounts={accounts}
                onUseMemorized={() => setAccountId(preview.applied_mapping.memorized_account_id)}
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-400 px-4">
            <input
              type="checkbox"
              checked={saveMapping}
              onChange={e => setSaveMapping(e.target.checked)}
              className="rounded"
            />
            Save this mapping for future imports
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={reset}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
            >
              Back
            </button>
            <button
              onClick={sourceKey === 'generic' ? applyWithUserMapping : applyImport}
              disabled={!accountId || busy}
              className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium"
            >
              {busy ? 'Importing…' : 'Apply import'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.SUMMARY && summary && (
        <div className="space-y-6">
          <div className="px-6 py-8 bg-slate-800 rounded-lg text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-xl mb-4">Import complete</h3>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="px-3 py-2 bg-slate-900 rounded">
                <div className="text-2xl font-light text-emerald-300">{summary.inserted}</div>
                <div className="text-xs text-slate-500 mt-1">Inserted</div>
              </div>
              <div className="px-3 py-2 bg-slate-900 rounded">
                <div className="text-2xl font-light text-amber-300">{summary.duplicates_skipped}</div>
                <div className="text-xs text-slate-500 mt-1">Duplicates skipped</div>
              </div>
              <div className="px-3 py-2 bg-slate-900 rounded">
                <div className="text-2xl font-light text-slate-300">{summary.candidates}</div>
                <div className="text-xs text-slate-500 mt-1">Total rows</div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
            >
              Import another file
            </button>
            <button
              onClick={() => navigate('/books/categorize')}
              className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
            >
              Review uncategorized →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, headers, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-sm"
      >
        <option value="">—</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

// ReImportBanner — soft info banner when this source has been used before.
// Shown after /imports returns. Surfaces the duplicate skip count so it doesn't look
// like a problem when many rows are skipped.
function ReImportBanner({ appliedMapping, candidates }) {
  const lastUsed = appliedMapping.last_used_at;
  const total = candidates.length;
  const dupCount = candidates.filter(c => c.dedupe_status === 'duplicate').length;
  let daysAgo = null;
  if (lastUsed) {
    const lastDate = new Date(lastUsed.replace(' ', 'T') + (lastUsed.includes('Z') ? '' : 'Z'));
    if (!Number.isNaN(lastDate.getTime())) {
      daysAgo = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    }
  }
  return (
    <div className="mb-4 px-4 py-3 bg-indigo-900/30 border border-indigo-700 rounded text-indigo-100 text-sm">
      <div className="font-medium mb-1">ℹ️ Re-importing a familiar source</div>
      <div className="text-xs text-indigo-200">
        {daysAgo !== null && (
          <>Last import from this source was {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}.</>
        )}
        {total > 0 && (
          <>
            {' '}
            {dupCount} of {total} row{total === 1 ? '' : 's'} match existing transactions and will be skipped.
          </>
        )}
      </div>
    </div>
  );
}

// CrossAccountGuard — soft inline warning when user picks a different account than the
// memorized one for this source. Advisory only — user can dismiss and proceed.
function CrossAccountGuard({ memorizedAccountId, accounts, onUseMemorized }) {
  const memorized = accounts.find(a => a.id === memorizedAccountId);
  if (!memorized) return null;
  return (
    <div className="mt-3 px-3 py-2 bg-amber-900/30 border border-amber-700 rounded text-amber-100 text-xs">
      <div className="mb-2">
        ⚠️ You previously imported from this source to <span className="text-amber-50">{memorized.code} {memorized.name}</span>.
        Importing to a different account will create transactions in the new account instead.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onUseMemorized}
          className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs"
        >
          Use memorized account
        </button>
        <button
          onClick={(e) => { e.currentTarget.closest('.bg-amber-900\\/30')?.remove(); }}
          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
        >
          Continue with new account
        </button>
      </div>
    </div>
  );
}