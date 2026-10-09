import {
  FUSIONX_SCENE_DENSITY,
  FUSIONX_SCENE_PALETTE,
  type FusionXSceneDensity,
  type FusionXScenePalette,
  type Rgb,
} from "./fusionx-palette";

/**
 * Builds the document the hero iframe runs: ThreeUI's authored "Living Green"
 * page, reduced to its WebGL scene and recoloured from the FusionX palette.
 *
 * The authored file on disk is never edited. Three things happen to a copy of
 * it, in memory, at load:
 *
 *  1. Scene only — the page's own markup (nav, headline, cards, stats,
 *     buttons) is dropped and just `<canvas id="scene">` is kept, the same
 *     isolation ThreeUI's SylvaLivingWorldScene adapter does. None of the demo
 *     copy or imagery is ever parsed, fetched or shown.
 *  2. Recolour — each colour constant listed in recolour() is swapped for its
 *     palette value. Only literals change; no shader logic, geometry, motion
 *     or interaction code is touched. The only non-colour literals changed are
 *     the large-screen blade count and render resolution (density()), for
 *     frame rate.
 *  3. Host bridge — a few lines that let the host page pause rendering and
 *     learn whether the scene started.
 *
 * Every swap is checked: if the authored file ever changes so that a target
 * is missing, this throws and the hero stays on its static poster instead of
 * rendering a half-recoloured scene.
 */

export const FUSIONX_SCENE_SOURCE_URL = "/landing-pages/inner-green-3d.html";
export const FUSIONX_SCENE_MESSAGE = "fusionx-hero";

const THREE_RUNTIME_TAG = '<script src="inner-green-assets/three.min.js"></script>';
const THREE_RUNTIME_PATH = "/landing-pages/inner-green-assets/three.min.js";
const PRESENTATION_START = '<main class="hero" id="hero">';

// The authored page declares its own webfont. No text is left in the scene
// document, so the declaration is dropped rather than shipping the font.
const FONT_FACE = /@font-face\s*\{[^}]*\}/;

const SCENE_ONLY_MARKUP =
  '<main class="hero" id="hero"><canvas id="scene"></canvas><div class="stage" id="stage" aria-hidden="true"></div></main>';

const vec3 = (c: Rgb) => `vec3(${c.map((v) => v.toFixed(4)).join(", ")})`;
const color = (c: Rgb) => `new THREE.Color(${c.map((v) => v.toFixed(4)).join(", ")})`;
const array = (c: Rgb) => `[${c.map((v) => v.toFixed(4)).join(", ")}]`;

/** One literal to swap. It must occur exactly `count` times (default 1). */
type Swap = { what: string; find: string; replace: string; count?: number };

function recolour(p: FusionXScenePalette): Swap[] {
  const b = p.butterfly;
  return [
    /* lights */
    { what: "key light", find: "new THREE.Color(1.14, 1.06, 0.88)", replace: color(p.light.key) },
    { what: "fill light", find: "new THREE.Color(0.78, 0.78, 0.62)", replace: color(p.light.fill) },
    { what: "ambient light", find: "new THREE.Color(0.086, 0.090, 0.080)", replace: color(p.light.ambient) },
    { what: "haze", find: "new THREE.Color(0.176, 0.195, 0.145)", replace: color(p.light.haze) },
    { what: "haze default", find: "[0.176, 0.195, 0.145]", replace: array(p.light.haze) },
    { what: "far-ridge haze", find: "[0.150, 0.164, 0.120]", replace: array(p.light.hazeFar) },

    /* bark + cushion */
    {
      what: "bark, raked",
      find: "mix(vec3(0.020, 0.019, 0.018), vec3(0.290, 0.283, 0.264), grain)",
      replace: `mix(${vec3(p.bark.slateDark)}, ${vec3(p.bark.slateLight)}, grain)`,
    },
    {
      what: "bark, damp",
      find: "mix(vec3(0.024, 0.019, 0.016), vec3(0.175, 0.140, 0.110), grain)",
      replace: `mix(${vec3(p.bark.inkDark)}, ${vec3(p.bark.inkLight)}, grain)`,
    },
    {
      what: "moss cushion",
      find: "mix(vec3(0.0204, 0.0311, 0.0050), vec3(0.0914, 0.1392, 0.0227), mo)",
      replace: `mix(${vec3(p.bark.cushionDark)}, ${vec3(p.bark.cushionLight)}, mo)`,
    },
    { what: "lichen", find: "vec3(0.162, 0.176, 0.132)", replace: vec3(p.bark.lichen) },

    /* moss pile */
    { what: "moss deep", find: "vec3 deep = vec3(0.0126, 0.0192, 0.0031);", replace: `vec3 deep = ${vec3(p.moss.deep)};` },
    { what: "moss mid", find: "vec3 mid  = vec3(0.0488, 0.0744, 0.0121);", replace: `vec3 mid  = ${vec3(p.moss.mid)};` },
    { what: "moss tip", find: "vec3 tip  = vec3(0.1222, 0.1860, 0.0304);", replace: `vec3 tip  = ${vec3(p.moss.tip)};` },
    {
      what: "moss highlight",
      find: "vec3 tipHi = vec3(0.2600, 0.3900, 0.0640);",
      replace: `vec3 tipHi = ${vec3(p.moss.tipHighlight)};`,
    },

    /* ferns */
    {
      what: "ferns",
      find: "mix(vec3(0.0270, 0.0450, 0.0099), vec3(0.0690, 0.1150, 0.0253), vTint)",
      replace: `mix(${vec3(p.fern.dark)}, ${vec3(p.fern.light)}, vTint)`,
    },

    /* survey pulse */
    {
      what: "survey pulse",
      find: "mix(vec3(0.30, 0.72, 0.46), vec3(0.86, 1.00, 0.90), rim)",
      replace: `mix(${vec3(p.pulse.trail)}, ${vec3(p.pulse.rim)}, rim)`,
    },

    /* flowers */
    { what: "flower petals", find: "'rgba(255,255,251,'", replace: `'rgba(${p.flower.petalRgb},'` },
    { what: "flower centre", find: "'#f0e7bd'", replace: `'${p.flower.centre}'` },

    /* ambient sprites */
    {
      what: "ground shadow",
      find: "[[0, 'rgba(12,16,10,0.62)'], [0.45, 'rgba(12,16,10,0.26)'], [1, 'rgba(12,16,10,0)']]",
      replace: `[[0, 'rgba(${p.groundShadowRgb},0.62)'], [0.45, 'rgba(${p.groundShadowRgb},0.26)'], [1, 'rgba(${p.groundShadowRgb},0)']]`,
    },
    {
      what: "back glow",
      find: "[[0, 'rgba(226,236,212,0.30)'], [0.42, 'rgba(214,226,200,0.10)'], [1, 'rgba(214,226,200,0)']]",
      replace: `[[0, '${p.backGlow.core}'], [0.42, '${p.backGlow.mid}'], [1, '${p.backGlow.fade}']]`,
    },
    {
      what: "pollen",
      find: "[[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(236,244,224,0.5)'], [1, 'rgba(236,244,224,0)']]",
      replace: `[[0, '${p.pollen.core}'], [0.35, '${p.pollen.halo}'], [1, '${p.pollen.haloFade}']]`,
    },

    /* butterfly */
    { what: "wing face", find: "vec3 face = vec3(0.330, 0.560, 0.042);", replace: `vec3 face = ${vec3(b.wingFace)};` },
    { what: "wing edge", find: "vec3 edge = vec3(0.062, 0.190, 0.014);", replace: `vec3 edge = ${vec3(b.wingEdge)};` },
    {
      what: "wing shimmer",
      find: "mix(wing * vec3(0.46, 1.14, 0.30), wing * vec3(1.34, 1.06, 0.16), shim)",
      replace: `mix(wing * ${vec3(b.shimmerA)}, wing * ${vec3(b.shimmerB)}, shim)`,
    },
    { what: "wing border", find: "vec3 dark  = vec3(0.030, 0.026, 0.014);", replace: `vec3 dark  = ${vec3(b.border)};` },
    { what: "wing spots, fore", find: "vec3 cream = vec3(0.520, 0.500, 0.290);", replace: `vec3 cream = ${vec3(b.spotFore)};` },
    { what: "wing spots, hind", find: "vec3 amber = vec3(0.400, 0.270, 0.045);", replace: `vec3 amber = ${vec3(b.spotHind)};` },
    { what: "wing veins", find: "vec3(0.430, 0.400, 0.180)", replace: vec3(b.vein) },
    { what: "wing fringe", find: "vec3(0.230, 0.215, 0.150)", replace: vec3(b.fringe) },
    {
      what: "wing backlight",
      find: "mix(vec3(0.86, 0.78, 0.20), vec3(0.34, 0.60, 0.12), border)",
      replace: `mix(${vec3(b.backlightA)}, ${vec3(b.backlightB)}, border)`,
    },
    { what: "wing sheen", find: "vec3(0.86, 0.96, 0.52) * sheen", replace: `${vec3(b.sheen)} * sheen` },
    {
      what: "body",
      find: "mix(vec3(0.020, 0.019, 0.011), vec3(0.070, 0.064, 0.030), band",
      replace: `mix(${vec3(b.bodyDark)}, ${vec3(b.bodyLight)}, band`,
    },
    { what: "body flecks", find: "vec3(0.46, 0.44, 0.24)", replace: vec3(b.bodyFleck) },
    { what: "antennae", find: "color: 0x171208", replace: `color: ${b.antennae}` },

    /* glow sprites: pollen, cursor trail, survey pulse, back glow */
    {
      what: "glow blending",
      find: "THREE.AdditiveBlending",
      replace: p.glowBlending === "additive" ? "THREE.AdditiveBlending" : "THREE.NormalBlending",
      count: 4,
    },
  ];
}

/** Large-screen blade counts and render resolution (see FUSIONX_SCENE_DENSITY). */
function density(d: FusionXSceneDensity): Swap[] {
  return [
    { what: "near blade count", find: "var BLADES_NEAR = small ? 70000 : 190000;", replace: `var BLADES_NEAR = small ? 70000 : ${Math.round(d.bladesNear)};` },
    { what: "far blade count", find: "var BLADES_FAR  = small ? 20000 :  60000;", replace: `var BLADES_FAR  = small ? 20000 : ${Math.round(d.bladesFar)};` },
    {
      what: "pixel ratio",
      find: "renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 2));",
      replace: `renderer.setPixelRatio(small ? Math.min(window.devicePixelRatio || 1, 1.6) : Math.min((window.devicePixelRatio || 1) * ${d.renderScale}, ${d.maxPixelRatio}));`,
    },
  ];
}

/** The page behind the transparent canvas, plus the scene-only frame rules. */
function sceneStyle(p: FusionXScenePalette) {
  const bg = p.background;
  const pool = (shape: string) =>
    `radial-gradient(${shape}, ${bg.pool[0]} 0%, ${bg.pool[1]} 42%, ${bg.pool[2]} 72%, ${bg.poolFade} 88%)`;
  return `<style data-fusionx-scene>
html,body{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;overflow:hidden!important}
html{background:${bg.top}!important}
body{position:relative!important;background:${bg.top}!important}
.hero{height:100%!important;min-height:0!important;background:
  radial-gradient(64% 52% at 27% 84%, ${bg.lift} 0%, rgba(0,0,0,0) 72%),
  radial-gradient(70% 60% at 92% 8%, ${bg.shade} 0%, rgba(0,0,0,0) 68%),
  linear-gradient(180deg, ${bg.top} 0%, ${bg.bottom} 100%)!important}
.hero::after{background:${pool("72% 44% at 50% 117%")}!important}
@media (max-width:900px){.hero::after{background:${pool("90% 30% at 50% 74%")}!important}}
</style>`;
}

/**
 * Host bridge. requestAnimationFrame is the scene's only clock, so holding
 * its callbacks while paused stops all rendering without touching scene code;
 * they are released, in order, on resume.
 */
const HOST_BRIDGE = `<script data-fusionx-bridge>
(function () {
  var raf = window.requestAnimationFrame.bind(window);
  var paused = false, held = [];
  window.requestAnimationFrame = function (cb) {
    if (paused) { held.push(cb); return 0; }
    return raf(cb);
  };
  function tell(state) { try { parent.postMessage({ type: "${FUSIONX_SCENE_MESSAGE}", state: state }, "*"); } catch (e) {} }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== parent || !d || d.type !== "${FUSIONX_SCENE_MESSAGE}") return;
    /* The host owns the pointer (its copy floats on it too) and relays it, so
       the scene sees the same pointermove it would have received directly. */
    if (d.pointer) {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: d.pointer.x, clientY: d.pointer.y, pointerType: "mouse" }));
      return;
    }
    if (d.leave) { window.dispatchEvent(new Event("pointerleave")); return; }
    if (!("paused" in d)) return;
    paused = !!d.paused;
    if (!paused && held.length) { var run = held; held = []; run.forEach(function (cb) { raf(cb); }); }
  });
  var tries = 0;
  var poll = setInterval(function () {
    if (window.__ready) { clearInterval(poll); tell("ready"); return; }
    if (paused || document.hidden) return;
    if (++tries > 40) { clearInterval(poll); tell("failed"); }
  }, 250);
})();
</script>`;

export function buildFusionXSceneDocument(
  authored: string,
  origin: string,
  palette: FusionXScenePalette = FUSIONX_SCENE_PALETTE,
  sceneDensity: FusionXSceneDensity = FUSIONX_SCENE_DENSITY,
): string {
  const presentationStart = authored.indexOf(PRESENTATION_START);
  const runtimeStart = authored.indexOf(THREE_RUNTIME_TAG);
  if (
    presentationStart < 0 ||
    runtimeStart <= presentationStart ||
    !authored.includes("</head>") ||
    !FONT_FACE.test(authored)
  ) {
    throw new Error("FusionX hero: could not isolate the authored Three.js scene.");
  }

  let source = `${authored.slice(0, presentationStart)}${SCENE_ONLY_MARKUP}\n\n${authored.slice(runtimeStart)}`;

  for (const swap of [...recolour(palette), ...density(sceneDensity)]) {
    const parts = source.split(swap.find);
    const expected = swap.count ?? 1;
    if (parts.length - 1 !== expected) {
      throw new Error(
        `FusionX hero: expected ${expected} "${swap.what}" in the authored scene, found ${parts.length - 1}.`,
      );
    }
    source = parts.join(swap.replace);
  }

  return source
    .replace(FONT_FACE, "")
    .replace(/<title>[^<]*<\/title>/, "<title>FusionX hero scene</title>")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("</head>", `${sceneStyle(palette)}</head>`)
    .replace(THREE_RUNTIME_TAG, `${HOST_BRIDGE}<script src="${origin}${THREE_RUNTIME_PATH}"></script>`);
}
