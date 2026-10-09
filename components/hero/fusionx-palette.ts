/**
 * Every colour the FusionX hero scene uses, in one place.
 *
 * The scene itself is ThreeUI's "Living Green" world, served untouched from
 * /public/landing-pages/inner-green-3d.html. Nothing about its geometry,
 * shaders, motion or interaction is changed — fusionx-scene-document.ts only
 * swaps the colour constants below into a copy of that document at load.
 *
 * BRAND holds the values sampled from /public/logo-mark.png. Everything else
 * is derived to sit in that navy / white / electric-blue family. There are two
 * palettes: one for the dark theme (a night scene on logo navy) and one for
 * the light theme (the same world in daylight, on a pale blue fog).
 *
 * Two notations, because the scene has two kinds of colour:
 *  - CSS strings   → page background, 2D-canvas textures (flowers, pollen).
 *  - [r, g, b]     → shader constants. These are linear-light albedo / light
 *                    values fed through the scene's own lighting and ACES
 *                    tone mapping, so they are not the on-screen colour.
 */

export type Rgb = readonly [number, number, number];

export const BRAND = {
  /** Logo disc. Sampled median #00030D (range #00030C–#01040E). */
  navy: "#00030D",
  /** Logo "X". Sampled median #FEFEFE. */
  white: "#FEFEFE",
  /** Logo slash. Sampled median #004DF6 (peak #0150FA). */
  blue: "#004DF6",
} as const;

export type FusionXScenePalette = {
  /** The page behind the transparent WebGL canvas. */
  background: {
    top: string;
    bottom: string;
    /** Soft lift low-left, where the root's light pool starts. */
    lift: string;
    /** Corner falloff, top-right. */
    shade: string;
    /** Floor light the root stands in: [centre, mid, outer] of one glow. */
    pool: readonly [string, string, string];
    poolFade: string;
  };
  /** Lights (shader uniforms, linear). */
  light: { key: Rgb; fill: Rgb; ambient: Rgb; haze: Rgb; hazeFar: Rgb };
  /** Roots: bark + the moss cushion on it. */
  bark: {
    slateDark: Rgb;
    slateLight: Rgb;
    inkDark: Rgb;
    inkLight: Rgb;
    cushionDark: Rgb;
    cushionLight: Rgb;
    lichen: Rgb;
  };
  /** The moss pile (fur blades). tipHighlight is the lit crown of each blade. */
  moss: { deep: Rgb; mid: Rgb; tip: Rgb; tipHighlight: Rgb };
  fern: { dark: Rgb; light: Rgb };
  /** Intro survey pulse (unlit, display values). */
  pulse: { trail: Rgb; rim: Rgb };
  /** Flowers (2D canvas texture). petalRgb is "r,g,b"; the scene adds alpha. */
  flower: { petalRgb: string; centre: string };
  /** Drifting pollen and the cursor trail (2D canvas sprite). */
  pollen: { core: string; halo: string; haloFade: string };
  /**
   * How the glow sprites (pollen, trail, pulse, back glow) composite.
   * "additive" is the authored mode and only reads on a dark ground; a pale
   * ground needs "normal" or they vanish.
   */
  glowBlending: "additive" | "normal";
  groundShadowRgb: string;
  backGlow: { core: string; mid: string; fade: string };
  butterfly: {
    wingFace: Rgb;
    wingEdge: Rgb;
    /** The two ends of the iridescent swing across the wing. */
    shimmerA: Rgb;
    shimmerB: Rgb;
    border: Rgb;
    /** Accents set into the wing margin. */
    spotFore: Rgb;
    spotHind: Rgb;
    vein: Rgb;
    fringe: Rgb;
    backlightA: Rgb;
    backlightB: Rgb;
    sheen: Rgb;
    bodyDark: Rgb;
    bodyLight: Rgb;
    bodyFleck: Rgb;
    antennae: string;
  };
};

/** Dark theme: a night scene on the logo navy. */
export const FUSIONX_SCENE_PALETTE: FusionXScenePalette = {
  background: {
    top: BRAND.navy,
    bottom: "#060B18",
    lift: "rgba(0, 77, 246, 0.10)",
    shade: "rgba(0, 0, 0, 0.30)",
    pool: ["rgba(150, 180, 255, 0.36)", "rgba(90, 130, 255, 0.15)", "rgba(40, 80, 220, 0.04)"],
    poolFade: "rgba(40, 80, 220, 0)",
  },
  light: {
    key: [1.0, 1.06, 1.22], // cool white key
    fill: [0.5, 0.62, 0.98], // blue bounce off the floor pool
    ambient: [0.058, 0.072, 0.115], // navy sky
    haze: [0.03, 0.046, 0.098], // near air
    hazeFar: [0.022, 0.034, 0.076], // far ridge air
  },
  bark: {
    slateDark: [0.01, 0.012, 0.018],
    slateLight: [0.105, 0.125, 0.172],
    inkDark: [0.008, 0.01, 0.018],
    inkLight: [0.058, 0.074, 0.122],
    cushionDark: [0.006, 0.01, 0.027],
    cushionLight: [0.028, 0.05, 0.135],
    lichen: [0.118, 0.138, 0.192],
  },
  moss: {
    deep: [0.004, 0.007, 0.02],
    mid: [0.014, 0.027, 0.078],
    tip: [0.04, 0.09, 0.3],
    tipHighlight: [0.08, 0.22, 0.8], // where the logo blue shows
  },
  fern: {
    dark: [0.012, 0.017, 0.031],
    light: [0.034, 0.05, 0.09],
  },
  pulse: {
    trail: [0.0, 0.3, 0.96],
    rim: [0.91, 0.93, 0.96],
  },
  flower: {
    petalRgb: "254,254,254",
    centre: "#9DB8FF",
  },
  pollen: {
    core: "rgba(255,255,255,1)",
    halo: "rgba(96,140,255,0.5)",
    haloFade: "rgba(0,77,246,0)",
  },
  glowBlending: "additive",
  groundShadowRgb: "0,2,8",
  backGlow: {
    core: "rgba(150,180,255,0.24)",
    mid: "rgba(70,115,255,0.09)",
    fade: "rgba(70,115,255,0)",
  },
  butterfly: {
    wingFace: [0.62, 0.66, 0.75], // white, seen face-on
    wingEdge: [0.16, 0.27, 0.62], // blue at a glancing angle
    shimmerA: [0.8, 0.92, 1.2],
    shimmerB: [1.08, 1.04, 0.98],
    border: [0.004, 0.008, 0.024], // navy margin
    spotFore: [0.05, 0.2, 0.95],
    spotHind: [0.0, 0.074, 0.92], // = BRAND.blue in linear light
    vein: [0.3, 0.36, 0.52],
    fringe: [0.16, 0.19, 0.27],
    backlightA: [0.55, 0.7, 1.0],
    backlightB: [0.05, 0.2, 0.8],
    sheen: [0.8, 0.9, 1.0],
    bodyDark: [0.006, 0.008, 0.016],
    bodyLight: [0.03, 0.038, 0.066],
    bodyFleck: [0.4, 0.44, 0.53],
    antennae: "0x05070f",
  },
};

/**
 * Light theme: the same world in daylight. Pale blue fog behind, the moss in
 * the logo blue, bark and ferns in navy, flowers white against the moss, and
 * a blue butterfly with a navy margin. The glow sprites switch to normal
 * blending (see glowBlending) so the pollen reads as blue motes on the fog.
 */
export const FUSIONX_SCENE_PALETTE_LIGHT: FusionXScenePalette = {
  background: {
    top: "#F4F6FB",
    bottom: "#DCE5FA",
    lift: "rgba(0, 77, 246, 0.07)",
    shade: "rgba(255, 255, 255, 0.55)",
    pool: ["rgba(255, 255, 255, 0.95)", "rgba(255, 255, 255, 0.55)", "rgba(255, 255, 255, 0.12)"],
    poolFade: "rgba(255, 255, 255, 0)",
  },
  light: {
    key: [1.3, 1.3, 1.34], // daylight
    fill: [0.82, 0.9, 1.12], // sky bounce off the pale floor
    ambient: [0.34, 0.4, 0.56],
    haze: [0.6, 0.68, 0.9],
    hazeFar: [0.74, 0.8, 0.96], // far ridge dissolves into the fog
  },
  bark: {
    slateDark: [0.012, 0.018, 0.045],
    slateLight: [0.1, 0.13, 0.24],
    inkDark: [0.008, 0.012, 0.035],
    inkLight: [0.05, 0.07, 0.16],
    cushionDark: [0.004, 0.02, 0.12],
    cushionLight: [0.012, 0.07, 0.42],
    lichen: [0.42, 0.5, 0.72],
  },
  moss: {
    deep: [0.002, 0.012, 0.085],
    mid: [0.004, 0.035, 0.3],
    tip: [0.006, 0.075, 0.62],
    tipHighlight: [0.05, 0.2, 0.75],
  },
  fern: {
    dark: [0.004, 0.012, 0.06],
    light: [0.012, 0.04, 0.2],
  },
  pulse: {
    trail: [0.0, 0.3, 0.96],
    rim: [0.0, 0.012, 0.05],
  },
  flower: {
    petalRgb: "254,254,254",
    centre: "#C9D8FF",
  },
  pollen: {
    core: "rgba(0,77,246,0.9)",
    halo: "rgba(0,77,246,0.32)",
    haloFade: "rgba(0,77,246,0)",
  },
  glowBlending: "normal",
  groundShadowRgb: "0,3,13",
  backGlow: {
    core: "rgba(255,255,255,0.5)",
    mid: "rgba(255,255,255,0.2)",
    fade: "rgba(255,255,255,0)",
  },
  butterfly: {
    wingFace: [0.0, 0.074, 0.92], // logo blue
    wingEdge: [0.0, 0.02, 0.3],
    shimmerA: [0.7, 0.9, 1.2],
    shimmerB: [1.1, 1.05, 1.0],
    border: [0.0, 0.002, 0.012], // navy margin
    spotFore: [0.9, 0.92, 0.96], // white accents
    spotHind: [0.9, 0.92, 0.96],
    vein: [0.0, 0.01, 0.12],
    fringe: [0.0, 0.01, 0.08],
    backlightA: [0.4, 0.6, 1.0],
    backlightB: [0.0, 0.1, 0.6],
    sheen: [0.8, 0.9, 1.0],
    bodyDark: [0.0, 0.002, 0.012],
    bodyLight: [0.01, 0.02, 0.08],
    bodyFleck: [0.3, 0.4, 0.7],
    antennae: "0x00030d",
  },
};

export type FusionXSceneTheme = "dark" | "light";

export const FUSIONX_SCENE_PALETTES: Record<FusionXSceneTheme, FusionXScenePalette> = {
  dark: FUSIONX_SCENE_PALETTE,
  light: FUSIONX_SCENE_PALETTE_LIGHT,
};

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
