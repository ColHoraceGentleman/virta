// Shared "Coming soon" stub content. Used by Dashboard, Setup Wizard, Categories,
// Settings. Each stub gets a clear "this isn't built yet" message, a one-line
// preview of what's coming, and a single CTA back to Transactions (the only
// fully-built v2 surface).
//
// Why this exists: the previous stubs tried to look real (search bars, charts,
// 18-row tables of fake data). When Patrick clicked into them, things looked
// half-built and broken. This template makes the stub state honest — the
// page is empty by design, not broken.

import React from 'react';

export function ComingSoonStub({ phase, title, preview, navigate }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Coming in {phase}
        </span>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow">
        <h1 className="text-2xl font-light tracking-wide text-slate-100 mt-0 mb-3">
          {title}
        </h1>
        <p className="text-slate-300 text-sm mb-4">
          This page is part of the v2 design but isn't built yet. The wireframe
          is locked ({phase} work will follow the wireframe's design).
        </p>
        {preview && (
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">What'll be here</p>
            <p className="text-sm text-slate-300 leading-relaxed">{preview}</p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/books/transactions')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Go to Transactions
          </button>
          <span className="text-xs text-slate-500">
            The only v2 surface that's built today.
          </span>
        </div>
      </div>
    </div>
  );
}