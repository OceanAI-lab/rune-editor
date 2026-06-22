# Rune

A Tiptap v3 / ProseMirror editor wrapper that ships product-grade block
behaviors — drag-and-drop, slash menu, side menu, drop indicator, block
selection, tables, columns, and more — so a React app can consume one editor.

Two packages, strict dependency direction `react → core`:

- **`@ocai/rune-core`** — headless Tiptap schema + extensions. No
  React, no DOM, no CSS. Usable in SSR / CLI / worker contexts.
- **`@ocai/rune-react`** — default UI: hooks, components, Tailwind v4,
  Radix primitives, Lucide icons. The primary consumer-facing package.

## Install

```bash
npm install @ocai/rune-core @ocai/rune-react
```

`@ocai/rune-react` has peer deps on `react`, `react-dom`, and
(optionally) `vite` + `emojibase-data`.

## Quick start

```tsx
import { RuneEditor } from "@ocai/rune-react";
import "@ocai/rune-react/style.css";

export function App() {
  return <RuneEditor />;
}
```

## Demo

A runnable demo app lives in [`apps/demo`](./apps/demo) and is deployed to
Vercel (build config in [`vercel.json`](./vercel.json)). To run it locally (it
consumes the built packages):

```bash
pnpm install
pnpm -r build      # build core + react first
pnpm demo          # start the demo dev server
```

## Development

```bash
pnpm install
pnpm -r build      # build both packages
pnpm -r typecheck
pnpm -r test
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). All commits
must carry a [Developer Certificate of Origin](https://developercertificate.org/)
sign-off (`git commit -s`); there is no CLA.

## License

[MPL-2.0](./LICENSE)
