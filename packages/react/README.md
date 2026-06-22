# @ocai/rune-react

Default Rune editor UI: hooks, components, and the chrome (slash menu,
side menu, inline toolbar, link hover card, color menu) on top of
[`@ocai/rune-core`](../core). Tailwind v4 + Radix primitives + Lucide icons.

---

## Install

```bash
pnpm add @ocai/rune-core @ocai/rune-react
```

`react@^19` and `react-dom@^19` are peer dependencies.

---

## Quick start

```tsx
import { useState } from "react"
import {
  RuneEditor,
  RuneSlashMenu,
  RuneEmojiPicker,
  RuneLinkMenu,
  type Editor,
} from "@ocai/rune-react"
import "@ocai/rune-react/style.css"   // required

export function MyEditor() {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <RuneEditor
      className="min-h-[500px]"
      content={initialDoc}
      onReady={setEditor}
    >
      <RuneSlashMenu editor={editor} />
      <RuneEmojiPicker editor={editor} />
      <RuneLinkMenu editor={editor} getItems={async () => []} />
    </RuneEditor>
  )
}
```

The suggestion-menu presets each take an `editor` prop. `<RuneEditor>`
builds the editor internally via `useRuneEditor`; pull the instance
out with `onReady` and pass it down. If you'd rather build the editor
yourself and hand it in:

```tsx
const editor = useRuneEditor({ content: initialDoc })
return (
  <RuneEditor editor={editor}>
    <RuneSlashMenu editor={editor} />
  </RuneEditor>
)
```

Math UI is wired by default: type `$$x^2$$` for inline math, choose
`/equation` for display math, or use the inline toolbar Math button.
Copy emits LaTeX source (`$x^2$` inline, `$$x^2$$` block) in both
`text/html` and `text/plain` — paste into Notion/Word/Docs lands as
the LaTeX source ready to drop into their equation editors. KaTeX is
used for rendering only and its CSS is imported through
`@ocai/rune-react/style.css`; if bundle size is sensitive,
check how your bundler emits KaTeX fonts from CSS assets.

---

## Components

### Editor shell

| Export | What |
|---|---|
| `RuneEditor`                          | The full editor surface — wraps `EditorContent` with `BlockActionsDropdown`, `InlineToolbar`, `LinkHoverCard`, and a `ComponentsContext` provider. |
| `RuneEditorProps`                     | Props type. Extends `UseRuneEditorOptions` plus `editor`, `onReady`, `className`, `style`, `placeholders`, `children`. |
| `useRuneEditor(options, deps)`        | Thin wrapper over Tiptap's `useEditor` that pre-composes `createRuneKit()`. |
| `UseRuneEditorOptions`                | Extends Tiptap `EditorOptions` with `kit?: CreateRuneKitOptions` and merged `extensions[]`. |

### Suggestion-menu presets

Pre-built menus that wire into `@ocai/rune-core`'s `SuggestionMenus`. Drop
them as children of `<RuneEditor>`.

| Preset | Trigger | What |
|---|---|---|
| `RuneSlashMenu`     | `/` | Slash command menu. Items come from each block's `slashMenuItems`. |
| `RuneEmojiPicker`   | `:` | Emoji grid picker. |
| `RuneLinkMenu`      | `[[` | Wiki-link picker. Pass `getItems` to query your link source. |
| `RuneMentionMenu`   | `@` | Mention picker. Opt-in — register the trigger via `kit.suggestionMenus`. |

Lower-level building blocks for custom menus:

- `SuggestionMenuController`, `SuggestionMenuPopover`
- `DefaultSuggestionMenu`, `defaultComponents`, `ComponentsContext`, `useComponentsContext`
- `useSuggestionMenuState`, `useLoadSuggestionMenuItems`, `useSuggestionMenuKeyboard`
- `getDefaultReactSlashMenuItems`
- `DefaultReactSuggestionItem`, `DefaultReactGridSuggestionItem`,
  `SuggestionMenuProps`, `SuggestionMenuPopoverProps`, `RuneComponentProps`

### Inline & block chrome

| Export | What |
|---|---|
| `BlockActionsDropdown`, `BlockActionsDropdownProps` | Side-menu dropdown (drag handle + plus button). |
| `InlineToolbar`, `InlineToolbarProps`               | Floating toolbar over text selections (bold, italic, color, link, …). |
| `LinkHoverCard`, `LinkHoverCardProps`               | Hover card on links (open / edit / copy / unlink). |
| `ColorMenu`, `ColorMenuProps`                       | Standalone color picker. |

### Re-exports from Tiptap

So consumers depend on a single package:

| Export | Source |
|---|---|
| `Editor`, `AnyExtension`                                            | `@tiptap/core` (via `@tiptap/react`) |
| `EditorContent`, `EditorProvider`, `useCurrentEditor`               | `@tiptap/react` |

### Icons

`@ocai/rune-react` bundles a small set of Lucide-derived icons used across
the chrome. They're exported from the package root for consumers who
want to match the visual language in their own UI. Names tend to track
the action they represent (`IconBold`, `IconChevronDown`, etc.) — pull
them via your editor's autocomplete; the export list is stable.

---

## Deep-linking to blocks

`<RuneEditor>` (and `<BlockActionsDropdown>` standalone) accept two
host-configurable props for the "Copy link to block" side-menu action:

- `buildBlockLink({ editor, blockId }) => string` — returns the URL written
  to the clipboard. If omitted, a browser default stamps `?block=<id>`
  into the current pathname. Override this when your app needs a richer
  shape (e.g. `?note=<noteId>&block=<id>` for multi-document hosts).
- `onCopyLink({ ok, blockId, url?, error? })` — fires after the clipboard
  write resolves or rejects. Use it to show your own toast. Rune does
  not ship a toast.

To navigate to a block from a URL, parse the host-specific query in your
app, then call `scrollToBlock(editor, blockId, { select: true })` once
the editor is ready. The default selection styles paint a single-block
`MultiBlockSelection` halo on the target.

### Block id stability

Block ids are 8-character `nanoid`s. They are stable within a document
across edits, but are **reassigned** when a paste introduces an id that
collides with an existing block in the doc (see
`packages/core/src/extensions/block-id.ts`). Cross-document deep links
therefore rely on the host preserving canonical `(doc, blockId)` pairs;
opening a link in a doc that doesn't contain the id is a no-op
(`scrollToBlock` returns `false`).

### Pasting block links as mentions

`<RuneEditor>` can also recognize copied block links when users paste them
back into another Rune editor. Hosts opt in by providing both:

- `parseBlockLink(href) => { docId, blockId, href } | null`
- `resolveBlockMention({ editor, target }) => { docTitle, blockPreview } | null`

When both props are present and the user pastes a single recognized block-link
URL into a collapsed selection, Rune shows a `Paste as` menu with `Mention`
and `URL`. `Mention` replaces the pasted URL with readable linked text such as
`Project notes - Launch checklist`; `URL` leaves the pasted URL as-is.

Use `openBlockLink({ editor, target, event })` to intercept clicks on those
recognized links. The host should open/load `target.docId`, then call
`scrollToBlock(editor, target.blockId, { select: true })` once the target
editor is ready.

The parser and `buildBlockLink` should agree on the same URL shape. Rune ships
`parseQueryBlockLink` for the simple `?doc=<docId>&block=<blockId>` shape used
by the playground; production apps can pass their own parser.

---

## Customizing

### Choose a focus policy

Rune does not autofocus by default. Focus on mount is product policy:
some apps want a new blank document to behave like Notion and accept
typing immediately, while others render editors below the fold, inside
detail panes, or alongside a separate page-title input.

`<RuneEditor>` and `useRuneEditor` both pass Tiptap's `autofocus`
option through unchanged. Use lowercase `autofocus`, not React's DOM
`autoFocus`:

```tsx
<RuneEditor content={doc} autofocus={isEmptyDocument(doc) ? "end" : false} />
```

If you build the editor yourself, the same option works there:

```tsx
const editor = useRuneEditor({
  content: doc,
  autofocus: isEmptyDocument(doc) ? "end" : false,
})
```

Keep `isEmptyDocument` in the host app so each product can define what
"empty" means for its own document shape.

### Read-only mode

Pass Tiptap's `editable` prop through `<RuneEditor>` or `useRuneEditor`
to mount in read-only. Flip it at runtime with the standard
`editor.setEditable(bool)` / `editor.isEditable`:

```tsx
const [readOnly, setReadOnly] = useState(false)
const [editor, setEditor] = useState<Editor | null>(null)

useEffect(() => {
  editor?.setEditable(!readOnly)
}, [editor, readOnly])

return (
  <RuneEditor
    content={doc}
    editable={!readOnly}        // initial state
    onReady={setEditor}
  >
    <RuneSlashMenu editor={editor} />
  </RuneEditor>
)
```

When read-only, rune gates every rune-specific UI surface in addition to
Tiptap's built-in text-input block:

- Browser-level (Tiptap default): typing, IME, paste — blocked by
  `contenteditable=false` inheriting from `.ProseMirror` down to every
  block. Selecting and copying still work.
- Rune-specific (extra gates added in `feat(readonly)`):
  - **side-menu** grip / `+` button — not rendered (decoration short-
    circuit)
  - **block drag**, **marquee drag-extend**, **table cell-handle drag**
    — `mousedown` early-returns
  - **table** `+ row` / `+ col` buttons — unmounted
  - **inline toolbar** — does not open on text selection; closes if you
    flip read-only with the toolbar already open
  - **block-actions dropdown** — closes
  - **link hover card** — keeps URL + Copy + Open-in-new-tab; drops the
    Edit button (Notion-style affordance), and snaps out of edit-mode
    if you flip read-only mid-edit

If you add a custom NodeView, **never** write `contenteditable="true"`
on it. That breaks the inheritance and makes the block typable in
read-only mode.

### Replace the suggestion-menu UI

The default menus use the components in `defaultComponents`. To swap
the menu/item visuals without re-implementing the controller, wrap
your tree in your own `ComponentsContext.Provider`:

```tsx
<ComponentsContext.Provider value={{ ...defaultComponents, MenuItem: MyItem }}>
  <RuneEditor>…</RuneEditor>
</ComponentsContext.Provider>
```

### Replace the chrome entirely

`<RuneEditor>` mounts `BlockActionsDropdown`, `InlineToolbar`, and
`LinkHoverCard` unconditionally. If you want to swap any of them, build
your editor from `useRuneEditor` + `EditorContent` directly:

```tsx
const editor = useRuneEditor({ content })
return (
  <>
    <EditorContent editor={editor} className="rune-editor" />
    <MyCustomToolbar editor={editor} />
  </>
)
```

The `.rune-editor` class is load-bearing — it's where the marquee
fallback listener, tail-click listener, and `padding-bottom: 30vh`
scroll-room all live. Keep it on the editor wrapper.

---

## See also

- [`packages/core/README.md`](../core/README.md) — the underlying
  schema + extension API.
