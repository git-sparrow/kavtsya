# design-tokens.json — additions (closes the last open handoff item)

Target file: `mobile/src/theme/design-tokens.json`. Three additions, DTCG format, matching the file's existing style. Values reference existing ramps — no new hexes except alpha variants of approved brand colors.

## 1. `qr-plate` — white QR surface (both themes)
QR codes always render on a white plate for scanability (turns 1–2 dark rule). Add to BOTH `semantic.light` and `semantic.dark` (after `"primary-surface"`):

```json
"qr-plate": {
  "$value": "{color.base.white}",
  "$type": "color",
  "$description": "QR code plate — always white in both themes for scanner contrast; QR modules use neutral-950 (espresso)."
}
```

## 2. `shadow.reward` — gold reward glow
Used on reward-ready cards (1f, 2d). Add to the `shadow` group after `"raised"`:

```json
"reward": {
  "$type": "shadow",
  "$value": {
    "color": "#e8b44a40",
    "offsetX": "0px",
    "offsetY": "6px",
    "blur": "22px",
    "spread": "0px"
  },
  "$description": "Gold glow for reward-ready cards — primary-400 at 25% alpha. Pairs with a 1.5px semantic primary border."
}
```

## 3. `scrim` — dialog overlay (both themes)
Standardizes the dialog scrims from turns 6–8. Add to `semantic.light` and `semantic.dark` (after `"disabled-foreground"`):

```json
// semantic.light
"scrim": {
  "$value": "#241b3a80",
  "$type": "color",
  "$description": "Dialog overlay — secondary-900 at 50%."
}

// semantic.dark
"scrim": {
  "$value": "#0a071499",
  "$type": "color",
  "$description": "Dialog overlay on dark — deepened to 60% so the dialog separates from the indigo background."
}
```

## Reminder rules already encoded in the canvas (no token change needed)
- Dark `danger` is salmon (`danger.400`) — solid-danger buttons in dark take `semantic.dark.background` as foreground, never `#fff` (6e rule).
- Dark chart non-peak bars use `raised`, never `primary-surface` (≡ surface in dark).
- Dark avatars on `primary-surface` need a 1px `primary` ring.
