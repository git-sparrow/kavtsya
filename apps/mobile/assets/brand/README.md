# Brand mark

The Кавця mark is the Берегиня ornament: nested diamonds, a centre dot and four
crossed rays, the same geometry the app draws inline as `components/berehynia.tsx`.

## Source of truth

The ornament's paths live in `scripts/build-icons.mjs`. Everything under
`assets/images/` and `kavtsya-mark.svg` is generated from them and must not be
hand-edited — regenerate instead:

```sh
pnpm --filter @kavtsya/mobile icons:build
```

`kavtsya-mark.svg` is the full-bleed icon as a vector, for design tools.

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
| Canvas | `#241b3a` | `secondary-900`; also `android.adaptiveIcon.backgroundColor` |
| Canvas, iOS dark | `#1b142c` | `secondary-950` |
| Ornament | `#e8b44a` | `primary-400` |

The splash backgrounds are the app's own — `#fbf6ec` light, `#241b3a` dark — so
the first painted frame continues the splash rather than replacing it. On the
light splash the ornament is drawn in the canvas ink, because gold on cream
lacks contrast.

## iOS layered icons

`ios.icon` uses the documented `{ light, dark, tinted }` PNG triplet. To adopt
iOS 26's layered treatment instead, build a `.icon` bundle in Apple's
[Icon Composer](https://developer.apple.com/icon-composer/) from
`kavtsya-mark.svg` and point `ios.icon` at the directory — Expo supports that
from SDK 54.
