// Inlined in <head> (app/layout.tsx). Every scroll reveal that lands on the
// first screen is shown the moment it is in the document, before any paint:
// otherwise the page heading and its intro wait, invisible, for the
// JavaScript that starts the IntersectionObserver in
// components/ui/scroll-reveal.tsx, which on a slow phone is seconds (and is
// what the page's Largest Contentful Paint was waiting for). The page streams
// in after the layout (app/loading.tsx), hence the MutationObserver; it is
// checked once a frame and switched off when the page has loaded. Reveals
// further down still animate in as before.
export const EARLY_REVEAL_SCRIPT = `
  try {
    var fxRaf = 0;
    var fxCheck = function () {
      fxRaf = 0;
      var h = innerHeight;
      document.querySelectorAll('.scroll-reveal:not(.scroll-revealed)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < h) {
          el.style.transition = 'none';
          el.classList.add('scroll-revealed');
        }
      });
    };
    var fxWatch = new MutationObserver(function () {
      if (!fxRaf) fxRaf = requestAnimationFrame(fxCheck);
    });
    fxWatch.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('load', function () { fxCheck(); fxWatch.disconnect(); });
  } catch (e) {}
`;
