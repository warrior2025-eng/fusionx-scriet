// The before-paint half of low-end mode (see lib/low-end.ts), inlined in
// app/layout.tsx. Plain strings, so a server component can import it.

// "-v2": a phone marked low-end by the first, stricter rules gets the full scene back.
export const KEY = "fx-lowend-v2";

export const LOW_END_INIT_SCRIPT = `
  try {
    var q = new URLSearchParams(location.search).get('lowend');
    if (q === '1' || q === '0') sessionStorage.setItem('${KEY}', q);
    var s = sessionStorage.getItem('${KEY}');
    var n = navigator, c = n.connection || {};
    // Only really weak hardware: Chrome reports a 6 GB phone as 4 GB, so 4 would catch most phones.
    var weak = (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || (n.deviceMemory && n.deviceMemory <= 2) || c.saveData
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (s === '1' || (s !== '0' && weak)) document.documentElement.setAttribute('data-lowend', '');
  } catch (e) {}
`;
