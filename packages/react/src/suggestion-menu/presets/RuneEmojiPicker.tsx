// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import type { Editor } from "@tiptap/core"
import {
  commitSuggestion,
  dismissSuggestionMenu,
  getSuggestionMenus,
} from "@ocai/rune-core"
import { editorViewDom } from "@/positioning"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SuggestionMenuPopover } from "../SuggestionMenuPopover"
import { useSuggestionMenuState } from "../hooks/useSuggestionMenuState"
import { loadEmojiIndex, filterEmojis, type EmojiResult } from "./emojiSearch"

const TRIGGER = ":"
// Glyph grid width — macOS / Notion-style dense grid. 9 columns at the
// popover's width gives ~32px cells.
const COLUMNS = 9

/**
 * In-document `:` emoji picker — a keyboard-navigable glyph **grid**.
 *
 * The live `:query` ({@link filterEmojis} over the Emojibase corpus) fills a
 * dense emoji grid; ←/→ move within a row, ↑/↓ move between rows, Enter (or
 * Tab) commits the highlighted emoji, Esc closes — all WITHOUT the caret
 * leaving the editor. ALL matches are shown (no cap); the grid scrolls (wheel
 * or arrow-keys, which scroll the highlight into view). Typing more filters
 * live; deleting the `:` closes it.
 *
 * It owns its list + keyboard rather than reusing the grid {@link EmojiPicker}
 * (frimousse): that picker drives nav off its OWN focus, which is incompatible
 * with keeping the caret in the editor. Navigation is wired straight into the
 * `:` trigger's `keyHandler`, the same slot the slash menu uses, so PM hands
 * us the keydown before it reaches the document.
 *
 * Distinct from the title/callout "Add icon" surfaces, which mount the
 * frimousse {@link EmojiPicker} directly (it holds focus, so its native
 * keyboard is fine). This component does NOT change that picker or its props.
 */
export interface RuneEmojiPickerProps {
  editor: Editor | null
  /**
   * Optional self-host base URL for Emojibase data. Forwarded to
   * {@link loadEmojiIndex}; defaults to the jsdelivr CDN. Point this at a
   * local mirror when the host can't reach the CDN (e.g. an Electron renderer
   * with a strict `connect-src 'self'` CSP) — pair it with the `emojibase`
   * Vite plugin from `@ocai/rune-react/vite`.
   */
  emojibaseUrl?: string
  /**
   * Custom render for the failure state — shown when the Emojibase corpus
   * can't be fetched (CDN blocked by CSP, offline on first load, configured
   * `emojibaseUrl` 404s). Receives the error and a `retry()`. Without it, a
   * minimal English message with a Retry button is shown. Mirrors
   * {@link EmojiPickerProps.renderError} so both pickers share one contract.
   */
  renderError?: (props: { error: Error; retry: () => void }) => ReactNode
}

interface GridNavBinding {
  count: number
  columns: number
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  commit: (index: number) => void
  close: () => void
}

// Returns true when the key is consumed (PM then prevents its default, so
// the caret never jumps and Enter never inserts a newline). Plain Shift is
// not a modifier here; Cmd/Ctrl/Alt chords pass through to host keybindings.
export function handleEmojiGridNavKey(
  event: KeyboardEvent,
  b: GridNavBinding,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.isComposing) return false
  const { count, columns, selectedIndex: i, setSelectedIndex, commit, close } = b

  if (event.key === "Escape") {
    close()
    return true
  }
  // With no matches we still swallow the nav/commit keys so the caret can't
  // wander out of the trigger token while the (empty) menu is open.
  const isNav =
    event.key === "ArrowRight" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowUp" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "PageDown" ||
    event.key === "PageUp"
  if (count === 0) {
    if (isNav || event.key === "Enter" || event.key === "Tab") return true
    return false
  }

  switch (event.key) {
    case "ArrowRight":
      setSelectedIndex(Math.min(count - 1, i + 1))
      return true
    case "ArrowLeft":
      setSelectedIndex(Math.max(0, i - 1))
      return true
    case "ArrowDown":
      // Step a full row; if that overflows, land on the last item so the
      // bottom (possibly partial) row is still reachable.
      setSelectedIndex(i + columns < count ? i + columns : count - 1)
      return true
    case "ArrowUp":
      // Step a row up; from the top row, fall back to the first item.
      setSelectedIndex(i - columns >= 0 ? i - columns : 0)
      return true
    case "PageDown":
      setSelectedIndex(Math.min(count - 1, i + columns * 4))
      return true
    case "PageUp":
      setSelectedIndex(Math.max(0, i - columns * 4))
      return true
    case "Home":
      setSelectedIndex(0)
      return true
    case "End":
      setSelectedIndex(count - 1)
      return true
    case "Enter":
    case "Tab":
      commit(i)
      return true
    default:
      return false
  }
}

type SearchState =
  | { status: "loading"; results: EmojiResult[]; error?: undefined }
  | { status: "ready"; results: EmojiResult[]; error?: undefined }
  | { status: "error"; results: EmojiResult[]; error: Error }

/**
 * Load the Emojibase corpus (cached per base URL) and filter it by `query`.
 * Surfaces `loading` / `error` (with `retry`) so the picker can show real
 * states instead of an ambiguous empty grid. Previous results are kept across
 * query changes (the corpus is cached, so re-filtering is a microtask) — no
 * flicker between keystrokes.
 */
function useEmojiSearch(query: string, emojibaseUrl: string | undefined) {
  const [state, setState] = useState<SearchState>({ status: "loading", results: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadEmojiIndex(emojibaseUrl)
      .then((index) => {
        if (!cancelled) setState({ status: "ready", results: filterEmojis(index, query) })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            results: [],
            error: err instanceof Error ? err : new Error(String(err)),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [query, emojibaseUrl, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { ...state, retry }
}

export function RuneEmojiPicker({
  editor,
  emojibaseUrl,
  renderError,
}: RuneEmojiPickerProps) {
  const state = useSuggestionMenuState(editor, TRIGGER)
  const query = state?.query ?? ""
  const { status, results, error, retry } = useEmojiSearch(query, emojibaseUrl)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [revealSelected, setRevealSelected] = useState(false)
  // Reset on every new session (show flip) AND on each typed character
  // (query change) — re-opening with the same query keeps a stale index.
  useEffect(() => {
    setSelectedIndex(0)
    setRevealSelected(false)
  }, [query, state?.show])

  const selectByKeyboard = useCallback((index: number) => {
    setRevealSelected(true)
    setSelectedIndex(index)
  }, [])
  const selectByHover = useCallback((index: number) => {
    setRevealSelected(false)
    setSelectedIndex(index)
  }, [])

  const close = useCallback(() => {
    if (editor) dismissSuggestionMenu(editor, TRIGGER)
  }, [editor])

  const commit = useCallback(
    (index: number) => {
      const pick = results[index]
      if (!editor || !pick || !state?.range) return
      commitSuggestion(
        { editor, range: state.range, triggerCharacter: TRIGGER },
        (chain) => chain.insertContent(pick.emoji),
      )
    },
    [editor, results, state?.range],
  )

  // Wire 2D navigation into the trigger's keyHandler. The ref is refreshed
  // every render so the handler reads live `results`/`selectedIndex` without
  // re-registering; the slot is cleared on unmount.
  const navRef = useRef<(event: KeyboardEvent) => boolean>(() => false)
  navRef.current = (event) =>
    handleEmojiGridNavKey(event, {
      count: results.length,
      columns: COLUMNS,
      selectedIndex,
      setSelectedIndex: selectByKeyboard,
      commit,
      close,
    })
  useEffect(() => {
    if (!editor) return
    const slot = getSuggestionMenus(editor).triggers[TRIGGER]
    if (!slot) return
    slot.keyHandler.current = (event) => navRef.current(event)
    return () => {
      slot.keyHandler.current = null
    }
  }, [editor])

  // Keep the keyboard-selected cell in view as the grid scrolls. Resolved by
  // `data-index` (cells are event-delegated, not individually ref'd, so the
  // grid scales to hundreds of matches without per-cell handlers).
  const gridRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!revealSelected) return
    const cell = gridRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`,
    )
    // jsdom has no scrollIntoView — guard so unit tests pass. `nearest` only
    // scrolls when the cell is off-screen, so no jitter per keypress.
    cell?.scrollIntoView?.({ block: "nearest" })
  }, [selectedIndex, revealSelected, results])

  const indexFromEvent = (e: ReactMouseEvent): number | null => {
    const btn = (e.target as HTMLElement).closest("button[data-index]")
    if (!btn) return null
    const i = Number((btn as HTMLElement).dataset.index)
    return Number.isInteger(i) ? i : null
  }

  if (!editor) return null

  const active = results[selectedIndex]

  return (
    <SuggestionMenuPopover
      open={state?.show ?? false}
      getClientRect={state?.getClientRect ?? null}
      contextElement={editorViewDom(editor)}
      popover={{ className: "w-80" }}
      // The footer is replaced by the active-emoji name strip below.
      showCloseFooter={false}
      onEscapeKeyDown={close}
      onPointerDownOutside={close}
      onClose={close}
    >
      <div className="rune-emoji-grid-picker">
        {status === "error" ? (
          <div
            role="alert"
            className="flex h-28 flex-col items-center justify-center gap-2 px-6 text-center text-sm"
          >
            {renderError ? (
              renderError({ error: error!, retry })
            ) : (
              <>
                <p className="text-muted-foreground">Couldn&rsquo;t load emoji data.</p>
                <Button type="button" variant="outline" size="xs" onClick={retry}>
                  Retry
                </Button>
              </>
            )}
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {status === "loading" ? "Loading…" : <>No emoji found for &ldquo;{query}&rdquo;</>}
          </div>
        ) : (
          // Native styled scrollbar (see `.rune-emoji-grid-scroller` in
          // suggestion.css). `pl-2` with no right padding balances the
          // stable scrollbar gutter on the right.
          <div className="rune-emoji-grid-scroller max-h-72 overflow-y-auto overscroll-contain pl-2">
            <div
              ref={gridRef}
              role="listbox"
              className="grid gap-0.5"
              style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
              // Keep the caret in the editor — never let a cell take focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const i = indexFromEvent(e)
                if (i !== null) commit(i)
              }}
              onMouseOver={(e) => {
                const i = indexFromEvent(e)
                if (i !== null) selectByHover(i)
              }}
            >
              {results.map((r, index) => (
                <EmojiCell
                  key={`${r.emoji}:${index}`}
                  emoji={r.emoji}
                  label={r.label}
                  index={index}
                  selected={index === selectedIndex}
                />
              ))}
            </div>
          </div>
        )}
        {active ? (
          // Active-emoji name strip (Notion pattern) — a glyph grid is
          // ambiguous without it. Doubles as the esc hint, replacing the
          // generic "Close menu" footer.
          <div className="flex items-center gap-2 border-t px-2.5 py-1 text-sm">
            <span className="text-base leading-none">{active.emoji}</span>
            <span className="truncate text-muted-foreground">{active.label}</span>
            <span className="ml-auto text-xs text-muted-foreground/60">esc</span>
          </div>
        ) : null}
      </div>
    </SuggestionMenuPopover>
  )
}

// Memoized so re-renders on selection change only repaint the two cells whose
// `selected` flips — the grid stays smooth at hundreds of matches. Pointer
// handling is delegated to the grid container (see `indexFromEvent`).
const EmojiCell = memo(function EmojiCell({
  emoji,
  label,
  index,
  selected,
}: {
  emoji: string
  label: string
  index: number
  selected: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      data-index={index}
      aria-selected={selected || undefined}
      aria-label={label}
      title={label}
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      {emoji}
    </button>
  )
})
