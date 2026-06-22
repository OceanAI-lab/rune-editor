// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../components/ui/popover"
import { Button } from "../components/ui/button"
import { CornerDownLeftIcon } from "../icons"
import { cn } from "../lib/utils"

type AnchorRef = RefObject<{ getBoundingClientRect: () => DOMRect }>
type VirtualRef = RefObject<{
  getBoundingClientRect: () => DOMRect
} | null> | null

export interface MathPopoverProps {
  virtualRef: VirtualRef
  initialLatex: string
  /**
   * Inline-variant only. When true, a Cancel/click-outside on a
   * fresh-insert empty draft calls `onDiscardInserted` to delete the
   * just-inserted node. Block variant ignores this — its close path
   * always auto-saves via `commit()`. Defaults to false.
   */
  deleteEmptyOnCancel?: boolean
  /** Default "inline". "block" routes all close paths through commit. */
  variant?: "inline" | "block"
  /** Block-variant only — renders an error footer when set. */
  errorMessage?: string
  /**
   * Default true (inline math). When false, an empty draft commits via
   * `onCommit("")` instead of `onDelete()` — block equation keeps its
   * placeholder rather than disappearing on close-with-empty.
   */
  deleteOnEmptyCommit?: boolean
  onLiveUpdate: (latex: string) => void
  onCancelRevert: () => void
  onCommit: (latex: string) => void
  onDelete: () => void
  /**
   * Inline-variant only. Invoked when a fresh-insert popover is
   * dismissed with an empty draft (paired with `deleteEmptyOnCancel`).
   * Block variant never calls this — defaults to a no-op.
   */
  onDiscardInserted?: () => void
  // Optional. Provided by NodeViews that can be entered via a
  // wrap-from-selection path (currently only inline math). When the
  // popover was opened with `deleteEmptyOnCancel=true` AND a non-empty
  // initial latex — i.e. the math node was just created by wrapping the
  // user's selection — dismissing the popover without an explicit commit
  // calls this to restore the original text. Done / Enter / Mod-Enter
  // still commit normally.
  onDiscardWrapped?: () => void
  onClose: () => void
  onPointerDownOutside?: (event: PointerEvent) => void
}

export function MathPopover({
  virtualRef,
  initialLatex,
  deleteEmptyOnCancel = false,
  variant = "inline",
  errorMessage,
  deleteOnEmptyCommit = true,
  onLiveUpdate,
  onCancelRevert,
  onCommit,
  onDelete,
  onDiscardInserted = () => {},
  onDiscardWrapped,
  onClose,
  onPointerDownOutside,
}: MathPopoverProps) {
  const initialLatexRef = useRef(initialLatex)
  const [draft, setDraft] = useState(initialLatexRef.current)
  // Wrap-from-selection session: the popover opened immediately after
  // a wrap converted real text into this math node. Detect via the
  // (deleteEmptyOnCancel=true, non-empty initial) combination — the
  // intent system sets deleteEmptyOnCancel on every fresh-insert open,
  // and only wrap starts that fresh-insert with text already in the
  // node. Cancel restores that text instead of leaving the math node
  // (or deleting it outright).
  const isWrapSessionRef = useRef(
    deleteEmptyOnCancel &&
      initialLatexRef.current.trim().length > 0 &&
      typeof onDiscardWrapped === "function",
  )
  const closingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // This component is mounted only for an active edit session. Keep the
  // open-time latex stable because live updates make the NodeView's
  // current node attr change on every keystroke.
  useEffect(() => {
    setDraft(initialLatexRef.current)
    queueMicrotask(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
  }, [])

  const finish = useCallback(
    (action: () => void) => {
      if (closingRef.current) return
      closingRef.current = true
      action()
      onClose()
    },
    [onClose],
  )

  const commit = useCallback(() => {
    const next = draft.trim()
    finish(() => {
      if (next) {
        onCommit(next)
      } else if (deleteOnEmptyCommit) {
        onDelete()
      } else {
        onCommit("")
      }
    })
  }, [draft, deleteOnEmptyCommit, finish, onCommit, onDelete])

  // Close path — what happens on Esc, click-outside, or Radix open-change.
  //   • variant=block      → auto-save via commit() (latex is the source of
  //                          truth; no "discard" semantics for the block).
  //   • wrap session       → restore the original selected text.
  //   • fresh insert empty → delete the inserted node entirely.
  //   • edit existing      → drop the draft preview; node attrs stay.
  // Done / Enter / Mod-Enter always commit explicitly via `commit()`.
  const cancelOrAutoSave = useCallback(() => {
    if (variant === "block") {
      commit()
      return
    }
    finish(() => {
      if (isWrapSessionRef.current && onDiscardWrapped) {
        onDiscardWrapped()
      } else if (deleteEmptyOnCancel) {
        onDiscardInserted()
      } else {
        onCancelRevert()
      }
    })
  }, [
    commit,
    deleteEmptyOnCancel,
    finish,
    onCancelRevert,
    onDiscardInserted,
    onDiscardWrapped,
    variant,
  ])

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (contentRef.current?.contains(target)) return
      onPointerDownOutside?.(event)
      cancelOrAutoSave()
    }

    document.addEventListener("pointerdown", onDocumentPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
    }
  }, [cancelOrAutoSave, onPointerDownOutside])

  if (!virtualRef?.current) return null
  const anchorRef = virtualRef as AnchorRef

  return (
    <Popover
      open={true}
      modal={false}
      onOpenChange={(next) => {
        if (!next) cancelOrAutoSave()
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        ref={contentRef}
        side="bottom"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          cancelOrAutoSave()
        }}
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e.detail.originalEvent)
          cancelOrAutoSave()
        }}
        onFocusOutside={(e) => e.preventDefault()}
        className={cn(
          "w-[min(400px,calc(100vw-24px))] flex-row items-center gap-2 px-2.5 py-2",
          variant === "block" &&
            "w-[min(560px,calc(100vw-24px))] flex-wrap items-start",
        )}
        data-rune-math-popover=""
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={textareaRef}
          aria-label="Equation (LaTeX)"
          placeholder="E = mc^2"
          value={draft}
          rows={variant === "block" ? 3 : 1}
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 resize-none bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground",
            // Inline keeps the old single-line clamp.
            variant === "inline" && "max-h-[50vh] overflow-auto",
            // Block variant: popover should start at 76px (textarea 60 +
            // popover py-2 = 16) and grow with content up to 373px
            // (textarea 357 + 16). field-sizing:content auto-grows the
            // textarea; min-h/max-h pin the bounds. rune-muted-scrollbar
            // gives the same thin gray pill the side-menu uses, instead
            // of the platform-default dark scrollbar.
            variant === "block" &&
              "field-sizing-content min-h-15 max-h-89.25 overflow-auto rune-muted-scrollbar",
          )}
          onChange={(e) => {
            const next = e.currentTarget.value
            setDraft(next)
            onLiveUpdate(next)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Escape") {
              e.preventDefault()
              cancelOrAutoSave()
              return
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              commit()
              return
            }
            // Enter commits for both inline and block sessions; Shift+
            // Enter falls through to the textarea default for multi-line
            // LaTeX entry (e.g. \begin{align}). Mod+Enter (handled
            // above) is the explicit "commit while keeping a newline"
            // fallback.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
          }}
        />
        {/* Done — primary affordance, shadcn "default" variant (filled
            bg-primary). onMouseDown preventDefault keeps PM editor focus
            from being stolen, so the underlying NodeSelection stays put
            and the popover doesn't get dismissed mid-click by Radix's
            DismissableLayer. */}
        <Button
          type="button"
          aria-label="Commit equation"
          className="shrink-0 self-start"
          onMouseDown={(e) => {
            e.preventDefault()
          }}
          onClick={() => {
            commit()
          }}
        >
          <span>Done</span>
          <CornerDownLeftIcon className="size-3.5" />
        </Button>
        {variant === "block" && errorMessage && (
          <div className="rune-math-popover-error" role="status">
            <span className="font-semibold">Invalid equation:</span>{" "}
            <span>{errorMessage}</span>
            <a
              href="https://katex.org/docs/supported.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
