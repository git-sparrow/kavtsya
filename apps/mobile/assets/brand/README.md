# Brand mark

The Кавця mark: a coffee bean inside a Берегиня-style nested diamond — the same
protective ornament the app draws inline as `components/berehynia.tsx`.

## Source of truth

`kavtsya-mark.svg` is the mark. Everything else under `assets/images/` is derived
from it and must not be hand-edited — regenerate instead:

```sh
pnpm --filter @kavtsya/mobile icons:build
```

`mark-paths.json` holds the mark's sub-paths in their 2048 authoring grid, split
so `scripts/build-icons.mjs` can recolour and recompose them per target. Both
files are generated together; edit the mark upstream, not here.

| Generated | Used by |
| --- | --- |
| `images/icon.png` | `expo.icon`, and `ios.icon.light` |
| `images/ios-icon-dark.png` | `ios.icon.dark` |
| `images/ios-icon-tinted.png` | `ios.icon.tinted` — greyscale; iOS grades it onto the Customer's tint |
| `images/android-icon-foreground.png` | `android.adaptiveIcon.foregroundImage` |
| `images/android-icon-monochrome.png` | `android.adaptiveIcon.monochromeImage` |
| `images/splash-icon.png` | `expo-splash-screen` light |
| `images/splash-icon-dark.png` | `expo-splash-screen` dark |

## Colours

| | Hex | Note |
| --- | --- | --- |
| Canvas | `#291c40` | also `android.adaptiveIcon.backgroundColor` |
| Canvas, iOS dark | `#1b142c` | `secondary-950` |
| Diamond, corner strokes, bean | `#dab36d` | |
| The bean's stripe | `#8a683c` | |

The splash backgrounds are the app's own — `#fbf6ec` light, `#241b3a` dark — so
the first painted frame continues the splash rather than replacing it.

## Two rules the artwork does not carry itself

- **The diamond's interior is a hole, not a fill.** The source paints it with the
  canvas colour, which only reads correctly on an opaque square. The build merges
  the diamond with its inner path under `fill-rule="evenodd"`, so the Android
  foreground and the splash mark let the background through.
- **The bean's stripe is punched out for the monochrome icon.** Android themed
  icons tint from the alpha channel alone; painted, the stripe vanishes and the
  bean flattens into a blank oval.

## iOS layered icons

`ios.icon` uses the documented `{ light, dark, tinted }` PNG triplet. To adopt
iOS 26's layered treatment instead, build a `.icon` bundle in Apple's
[Icon Composer](https://developer.apple.com/icon-composer/) from
`kavtsya-mark.svg` and point `ios.icon` at the directory — Expo supports that
from SDK 54.
