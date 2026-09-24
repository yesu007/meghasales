'use client';

import { useEffect, useRef, useState } from 'react';

// Every "master data" CRUD screen in this app (Verticals, Stages, Packages,
// Salary Structures, Shift Master, ...) shows its Add/Edit form inline —
// a plain card above or within the list, not a modal — toggled visible by
// a `showForm` boolean and populated for editing via an `openEdit(item)`
// call. That form can end up off-screen: a long list, an already-scrolled
// page, or clicking Edit on a row further down all leave the user staring
// at wherever they were with no visual cue anything happened.
//
// `trigger()` bumps a counter every time "New" or "Edit" is clicked —
// deliberately NOT gated on the form's own visibility state, so clicking
// Edit on a different row while the form is ALREADY open still re-fires
// the scroll (a plain boolean wouldn't see a change there, since it's
// already `true`). React commits state updates before this effect runs,
// so `ref.current` is already attached to the freshly-rendered form on a
// fresh open too, not just on a re-open.
export function useScrollFormIntoView<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [openToken, setOpenToken] = useState(0);

  useEffect(() => {
    if (openToken > 0) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [openToken]);

  const trigger = () => setOpenToken((t) => t + 1);

  return { ref, trigger };
}
