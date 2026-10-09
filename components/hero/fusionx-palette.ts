/**
 * Every colour the FusionX hero scene uses, in one place.
 *
 * The scene itself is ThreeUI's "Living Green" world, served untouched from
 * /public/landing-pages/inner-green-3d.html. Nothing about its geometry,
 * shaders, motion or interaction is changed — fusionx-scene-document.ts only
 * swaps the colour constants below into a copy of that document at load.
 *
 * BRAND holds the values sampled from /public/logo-mark.png. Everything else
 * is derived to sit in that navy / white / electric-blue family.
 *
 * Two notations, because the scene has two kinds of colour:
 *  - CSS strings   → page background, 2D-canvas textures (flowers, pollen).
 *  - [r, g, b]     → shader constants. These are linear-light albedo / light
 *                    values fed through the scene's own lighting and ACES
 *                    tone mapping, so they are deliberately much darker than
 *                    the on-screen colour they produce.
 */

export type Rgb = readonly [number, number, number];

export const BRAND = {
  /** Logo disc. Sampled median #00030D (range #00030C–#01040E). */
  navy: "#00030D",
  /** Logo "X". Sampled median #FEFEFE. */
  white: "#FEFEFE",
  /** Logo slash. Sampled median #004DF6 (peak #0150FA). */
  blue: "#004DF6",
  /** Site ink on dark (--color-ink). */
  softWhite: "#E8ECF4",
} as const;

export const FUSIONX_SCENE_PALETTE = {
  /* ── page behind the transparent WebGL canvas ─────────────────────── */
  background: {
    top: BRAND.navy,
    bottom: "#060B18",
    /** Soft blue lift low-left, where the root's light pool starts. */
    lift: "rgba(0, 77, 246, 0.10)",
    /** Corner falloff, top-right. */
    shade: "rgba(0, 0, 0, 0.30)",
    /** Floor light the root stands in: [centre, mid, outer] of one glow. */
    pool: ["rgba(150, 180, 255, 0.36)", "rgba(90, 130, 255, 0.15)", "rgba(40, 80, 220, 0.04)"],
    poolFade: "rgba(40, 80, 220, 0)",
  },

  /* ── lights (shader uniforms, linear) ─────────────────────────────── */
  light: {
    key: [1.0, 1.06, 1.22] as Rgb, // cool white key
    fill: [0.5, 0.62, 0.98] as Rgb, // blue bounce off the floor pool
    ambient: [0.058, 0.072, 0.115] as Rgb, // navy sky
    haze: [0.03, 0.046, 0.098] as Rgb, // near air
    hazeFar: [0.022, 0.034, 0.076] as Rgb, // far ridge air
  },

  /* ── roots: bark + the moss cushion on it ─────────────────────────── */
  bark: {
    slateDark: [0.01, 0.012, 0.018] as Rgb,
    slateLight: [0.105, 0.125, 0.172] as Rgb,
    inkDark: [0.008, 0.01, 0.018] as Rgb,
    inkLight: [0.058, 0.074, 0.122] as Rgb,
    cushionDark: [0.006, 0.01, 0.027] as Rgb,
    cushionLight: [0.028, 0.05, 0.135] as Rgb,
    lichen: [0.118, 0.138, 0.192] as Rgb,
  },

  /* ── the moss pile (fur blades) ───────────────────────────────────── */
  moss: {
    deep: [0.004, 0.007, 0.02] as Rgb,
    mid: [0.014, 0.027, 0.078] as Rgb,
    tip: [0.04, 0.09, 0.3] as Rgb,
    /** Lit crown of each blade — where the logo blue shows. */
    tipHighlight: [0.08, 0.22, 0.8] as Rgb,
  },

  /* ── ferns ────────────────────────────────────────────────────────── */
  fern: {
    dark: [0.012, 0.017, 0.031] as Rgb,
    light: [0.034, 0.05, 0.09] as Rgb,
  },

  /* ── intro survey pulse (unlit, display values) ───────────────────── */
  pulse: {
    trail: [0.0, 0.3, 0.96] as Rgb,
    rim: [0.91, 0.93, 0.96] as Rgb,
  },

  /* ── flowers (2D canvas texture) ──────────────────────────────────── */
  flower: {
    /** "r,g,b" — the scene appends its own alpha. */
    petalRgb: "254,254,254",
    centre: "#9DB8FF",
  },

  /* ── drifting pollen + the two ambient sprites (2D canvas) ────────── */
  pollen: {
    core: "rgba(255,255,255,1)",
    halo: "rgba(96,140,255,0.5)",
    haloFade: "rgba(0,77,246,0)",
  },
  groundShadowRgb: "0,2,8",
  backGlow: {
    core: "rgba(150,180,255,0.24)",
    mid: "rgba(70,115,255,0.09)",
    fade: "rgba(70,115,255,0)",
  },

  /* ── butterfly ────────────────────────────────────────────────────── */
  butterfly: {
    wingFace: [0.62, 0.66, 0.75] as Rgb, // white, seen face-on
    wingEdge: [0.16, 0.27, 0.62] as Rgb, // blue at a glancing angle
    /** The two ends of the iridescent swing across the wing. */
    shimmerA: [0.8, 0.92, 1.2] as Rgb,
    shimmerB: [1.08, 1.04, 0.98] as Rgb,
    border: [0.004, 0.008, 0.024] as Rgb, // navy margin
    spotFore: [0.05, 0.2, 0.95] as Rgb, // blue accents set into the margin
    spotHind: [0.0, 0.074, 0.92] as Rgb, // = BRAND.blue in linear light
    vein: [0.3, 0.36, 0.52] as Rgb,
    fringe: [0.16, 0.19, 0.27] as Rgb,
    backlightA: [0.55, 0.7, 1.0] as Rgb,
    backlightB: [0.05, 0.2, 0.8] as Rgb,
    sheen: [0.8, 0.9, 1.0] as Rgb,
    bodyDark: [0.006, 0.008, 0.016] as Rgb,
    bodyLight: [0.03, 0.038, 0.066] as Rgb,
    bodyFleck: [0.4, 0.44, 0.53] as Rgb,
    antennae: "0x05070f",
  },
} as const;

export type FusionXScenePalette = typeof FUSIONX_SCENE_PALETTE;

/**
 * Large-screen render budget — the only non-colour values changed in the
 * scene. As authored (190,000 / 60,000 blades at full resolution) the scene,
 * now filling the whole viewport behind the home page, measured ~30 fps on an
 * integrated laptop GPU. Benchmarked standalone at 1440×900 on that GPU:
 *
 *   190k blades, 1.00×  37 fps      110k blades, 1.00×  47 fps
 *   190k blades, 0.75×  48 fps      110k blades, 0.75×  60 fps
 *
 * Resolution matters more than blade count, so both are trimmed.
 *  - bladesNear / bladesFar: moss blades on the near root / far ridge.
 *  - renderScale: fraction of the device pixel ratio the scene renders at
 *    (the browser upscales it); maxPixelRatio caps it on hi-dpi screens.
 * Small screens keep the authored 70,000 / 20,000 blades and pixel ratio.
 */
export const FUSIONX_SCENE_DENSITY = {
  bladesNear: 110_000,
  bladesFar: 35_000,
  renderScale: 0.75,
  maxPixelRatio: 1.5,
} as const;

export type FusionXSceneDensity = typeof FUSIONX_SCENE_DENSITY;
