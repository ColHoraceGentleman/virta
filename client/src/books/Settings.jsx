// Virta Books — v2 Settings (coming soon stub).
//
// Per Patrick's feedback (2026-07-09 21:25 MDT): the previous stub had a 3-tab
// structure with empty bodies that felt broken. This is the honest stub.

import { ComingSoonStub } from './_stub-template.jsx';

export default function Settings({ navigate, path }) {
  // The path arg tells us which tab is active. Until Settings is built,
  // we collapse all three tabs to the same Coming Soon message.
  return (
    <ComingSoonStub
      phase="Phase 1"
      title="Settings"
      preview="Three tabs: General (business name, EIN, currency), Categories (default sort, show account numbers), Other (accounting method, fiscal year start, run setup wizard again). Each tab is a real settings surface — form fields, validation, save/cancel, all wired to the API. The current stub doesn't render tabs because there's nothing real to switch between yet."
      navigate={navigate}
    />
  );
}