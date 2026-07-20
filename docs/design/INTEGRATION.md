# Кавця · підключення дизайн-токенів (для Олека)

Як завести `design-tokens.json` у код-репозиторій. Стек: **React Native + Expo, TypeScript,
монорепо**. Формат токенів — **W3C DTCG** (`$value`/`$type`).

## Головний принцип

**Семантичні токени — це API для застосунку.** Компоненти беруть `semantic.light/dark.*`
(наприклад `background`, `foreground`, `primary`, `focus`), а не примітиви (`color.gold.400`).
Примітиви — «сира» палітра, з якої зібрана семантика; напряму в UI їх не використовуємо.
Тема (світла/темна) — це вибір гілки `light` чи `dark`.

## Куди покласти файл

Канонічний `design-tokens.json` має жити **в репозиторії** — напр. `packages/design-tokens/`
(монорепо) або `apps/mobile/src/theme/`. Копія в теці Марі (`design-system/`) — це дизайнерське
джерело; коли Марі щось змінює, воно приходить через `DECISIONS.md`, і ти синхронізуєш файл.

## Варіант A (рекомендований для RN) — легкий білд без залежностей

Резолвер аліасів + конвертація `px→number` (RN хоче числа), генерує `theme.generated.ts`
з вкладеним обʼєктом. Нуль зовнішніх залежностей.

```js
// scripts/build-theme.mjs   →  node scripts/build-theme.mjs
import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('design-tokens.json', 'utf8'));

const resolve = (v) =>
  typeof v === 'string' && v.startsWith('{')
    ? resolve(v.slice(1, -1).split('.').reduce((o, k) => o[k], t)['$value'])
    : v;

// dimension "16px" → 16 (RN numbers); залишаємо кольори/рядки як є
const num = (v) => (typeof v === 'string' && /^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : v);

const walk = (node) => {
  if (node && node.$value !== undefined) return num(resolve(node.$value));
  const out = {};
  for (const [k, val] of Object.entries(node)) if (!k.startsWith('$')) out[k] = walk(val);
  return out;
};

const theme = {
  color: walk(t.color),
  light: walk(t.semantic.light),
  dark:  walk(t.semantic.dark),
  font:  walk(t.font),
  space: walk(t.space),
  radius: walk(t.radius),
  motion: walk(t.motion),
};

fs.writeFileSync(
  'apps/mobile/src/theme/theme.generated.ts',
  '// AUTO-GENERATED from design-tokens.json — do not edit by hand\n' +
  'export const tokens = ' + JSON.stringify(theme, null, 2) + ' as const;\n'
);
```

Хук теми (перемикання світла/темна за системною схемою):

```ts
// apps/mobile/src/theme/useTheme.ts
import { useColorScheme } from 'react-native';
import { tokens } from './theme.generated';

export function useTheme() {
  const scheme = useColorScheme();               // 'light' | 'dark' | null
  const c = scheme === 'dark' ? tokens.dark : tokens.light;
  return { ...tokens, c };                        // t.c.* — семантика поточної теми
}
```

Використання в компоненті:

```tsx
const t = useTheme();
<View style={{ backgroundColor: t.c.background, padding: t.space['4'] }}>
  <Text style={{ color: t.c.foreground, fontSize: t.font.size.base }}>Кавця</Text>
  <Pressable style={{ backgroundColor: t.c.primary, borderRadius: t.radius.md, padding: t.space['4'] }}>
    <Text style={{ color: t.c['primary-foreground'], fontWeight: '700' }}>Увійти</Text>
  </Pressable>
</View>
```

## Варіант B (стандарт індустрії) — Style Dictionary v4

Якщо захочеш ще й CSS-змінні (для лендінгу/маркетингу) або кілька платформ з одного джерела.
SD v4 має **нативну підтримку DTCG** (`$value`/`$type`).

```js
// style-dictionary.config.mjs
export default {
  source: ['design-tokens.json'],
  platforms: {
    ts:  { transformGroup: 'js',  buildPath: 'apps/mobile/src/theme/',
           files: [{ destination: 'tokens.ts',  format: 'javascript/es6' }] },
    css: { transformGroup: 'css', buildPath: 'apps/web/src/styles/',
           files: [{ destination: 'tokens.css', format: 'css/variables' }] },
  },
};
```

```bash
npm i -D style-dictionary
npx style-dictionary build --config style-dictionary.config.mjs
```

Примітка: стандартні формати SD дають «пласкі» імена (`ColorPrimary400`, `--color-primary-400`).
Для зручного **вкладеного** обʼєкта з поділом light/dark у RN — Варіант A практичніший
(або пиши власний `format` у SD). Прямого React-Native-експорту в інструменті-генераторі немає,
тому DTCG-JSON — канонічний вхід у будь-якому разі.

## Шрифти (Expo)

```bash
npx expo install expo-font @expo-google-fonts/cormorant-garamond @expo-google-fonts/manrope
```

```tsx
import { useFonts } from 'expo-font';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
// display (заголовки/Передбачення) → Cormorant; інтерфейс → Manrope
```

## Доступність у RN (не з коробки від токенів)

Токени вже дають контраст **WCAG 2.2 AA** в обох темах. Але кілька речей — на рівні коду:

- **Динамічний розмір шрифту**: лишай `allowFontScaling` (типово увімкнено), перевір верстку
  при збільшеному системному шрифті.
- **Тач-таргети ≥ 44×44 pt (iOS) / 48dp (Android)** — `minHeight`/`hitSlop` на кнопках, іконках.
- **Не покладайся на колір**: статуси (успіх/увага/помилка) під дальтонізмом зливаються —
  завжди дублюй іконкою/текстом/формою (WCAG 1.4.1).
- **Фокус/скрін-рідери**: `accessibilityRole`, `accessibilityLabel`, `accessible`; фокус-токен
  (`t.c.focus`) видимий ≥3:1.
- Disabled-стан навмисно приглушений (виняток WCAG) — не використовуй disabled-колір як текст.

## Робочий цикл

1. Дизайн змінюється → Марі фіксує в `DECISIONS.md` → ти оновлюєш `design-tokens.json` у репо.
2. `node scripts/build-theme.mjs` (або SD build) → перегенерований `theme.generated.ts`.
3. **Ніколи не редагуй згенерований файл руками** — тільки джерело `design-tokens.json`.
4. За бажанням — прогін білду в `prebuild`/CI, щоб тема завжди актуальна.
