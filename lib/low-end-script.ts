// The before-paint half of low-end mode (see lib/low-end.ts), inlined in
// app/layout.tsx. Plain strings, so a server component can import it.

export const KEY = "fx-lowend";

export const LOW_END_INIT_SCRIPT = `
  try {
    var q = new URLSearchParams(location.search).get('lowend');
    if (q === '1' || q === '0') sessionStorage.setItem('${KEY}', q);
    var s = sessionStorage.getItem('${KEY}');
    var n = navigator, c = n.connection || {};
    var weak = (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 4) || c.saveData
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (s === '1' || (s !== '0' && weak)) document.documentElement.setAttribute('data-lowend', '');
  } catch (e) {}
`;
