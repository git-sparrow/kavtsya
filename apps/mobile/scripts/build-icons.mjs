// Derive every launcher and splash asset from one vector source
// (`assets/brand/kavtsya-mark.svg`), so the committed PNGs stay in lockstep with
// the mark and can be regenerated instead of hand-edited: `pnpm icons:build`.
//
// Two rules the artwork does not carry on its own and this script applies:
//
//  - The diamond's interior is painted with the background colour in the source.
//    That reads correctly only on an opaque canvas, so here the diamond and its
//    inner path are merged under `fill-rule="evenodd"` and the interior becomes a
//    real hole — otherwise the Android foreground and the splash mark would show
//    a purple slab where the canvas should show through.
//  - Android themed icons are tinted from the alpha channel alone, so the bean's
//    stripe is punched out of the bean rather than painted; left as a fill it
//    disappears and the bean flattens into a blank oval.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets",
);

// Brand hexes as the mark is drawn. The purples are the theme's own secondary-900
// (app dark background) and secondary-950; the golds are the mark's.
const INK = "#291c40"; // canvas
const DEEP = "#1b142c"; // canvas, iOS dark appearance
const GOLD = "#dab36d"; // diamond, corner strokes, bean
const BREW = "#8a683c"; // the bean's stripe

// Sub-paths of the mark, lifted from the source SVG's 2048 authoring grid.
const P = JSON.parse(
  fs.readFileSync(path.join(ASSETS, "brand/mark-paths.json"), "utf8"),
);

const svg = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

/** The mark in 2048-space. Pass `stripe: null` to punch the stripe out instead. */
const mark = ({ ring, bean, stripe }) =>
  [
    `<path fill="${ring}" fill-rule="evenodd" d="${P.diamond} ${P.hole}"/>`,
    stripe
      ? `<path fill="${bean}" d="${P.bean}"/><path fill="${stripe}" d="${P.stripe}"/>`
      : `<path fill="${bean}" fill-rule="evenodd" d="${P.bean} ${P.stripe}"/>`,
    ...["cornerNE", "cornerSW", "cornerNW", "cornerSE"].map(
      (k) => `<path fill="${ring}" d="${P[k]}"/>`,
    ),
  ].join("");

// Measure the mark once so the derived crops and safe-zone fits are exact rather
// than eyeballed.
const bb = new Resvg(
  svg(2048, 2048, mark({ ring: GOLD, bean: GOLD, stripe: BREW })),
).getBBox();

/** Full-bleed square: the mark over an opaque canvas, as the icon ships. */
const fullBleed = (bg, colors) =>
  svg(2048, 2048, `<path fill="${bg}" d="${P.bg}"/>${mark(colors)}`);

/** The mark alone, scaled to `fill` of a square canvas' height and centred. */
const centred = (colors, fill) => {
  const s = (2048 * fill) / bb.height;
  const tx = 1024 - (bb.x + bb.width / 2) * s;
  const ty = 1024 - (bb.y + bb.height / 2) * s;
  return svg(
    2048,
    2048,
    `<g transform="translate(${tx} ${ty}) scale(${s})">${mark(colors)}</g>`,
  );
};

/** The mark cropped to its own bounds plus `pad` (a fraction of its height). */
const cropped = (colors, pad) => {
  const m = bb.height * pad;
  const w = Math.round(bb.width + m * 2);
  const h = Math.round(bb.height + m * 2);
  return svg(
    w,
    h,
    `<g transform="translate(${m - bb.x} ${m - bb.y})">${mark(colors)}</g>`,
  );
};

const render = (file, markup, width) => {
  const png = new Resvg(markup, { fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
  fs.writeFileSync(path.join(ASSETS, file), png);
  console.log(
    `  ${file.padEnd(38)} ${png.length.toLocaleString().padStart(9)} B`,
  );
};

const full = { ring: GOLD, bean: GOLD, stripe: BREW };

console.log("icon:");
// `ios.icon.light` reuses this one — the light appearance is the base icon.
render("images/icon.png", fullBleed(INK, full), 1024);
render("images/ios-icon-dark.png", fullBleed(DEEP, full), 1024);
// iOS grades the tinted appearance by luminance onto the Customer's chosen tint,
// so this variant is greyscale, not gold.
render(
  "images/ios-icon-tinted.png",
  fullBleed("#000000", { ring: "#ffffff", bean: "#ffffff", stripe: "#8c8c8c" }),
  1024,
);

// The mark is tall, so what has to clear Android's 66dp safe circle (r = 11/36 of
// the 108dp canvas) is the diagonal reach of the X tips, not the height. Measured
// at this fill the furthest opaque pixel sits at r = 0.283 — comfortably inside;
// 0.64 would put it at 0.323 and overrun the safe zone.
const SAFE_ZONE_FILL = 0.56;
console.log("android adaptive:");
render(
  "images/android-icon-foreground.png",
  centred(full, SAFE_ZONE_FILL),
  1024,
);
render(
  "images/android-icon-monochrome.png",
  centred({ ring: "#ffffff", bean: "#ffffff", stripe: null }, SAFE_ZONE_FILL),
  1024,
);

// Cropped to the mark so `imageWidth` in the splash config means the mark's own
// width. Light inverts the diamond to ink so it holds contrast on the cream
// background; dark is the icon's own gold.
console.log("splash:");
render(
  "images/splash-icon.png",
  cropped({ ring: INK, bean: GOLD, stripe: BREW }, 0.03),
  900,
);
render("images/splash-icon-dark.png", cropped(full, 0.03), 900);

// The mark itself, kept readable and hand-off-able — this is what to feed a
// design tool (Icon Composer, Figma) rather than the raster output.
console.log("brand:");
fs.writeFileSync(
  path.join(ASSETS, "brand/kavtsya-mark.svg"),
  svg(
    1024,
    1024,
    `<g transform="scale(0.5)"><path fill="${INK}" d="${P.bg}"/>${mark(full)}</g>`,
  ) + "\n",
);
console.log("  brand/kavtsya-mark.svg");
