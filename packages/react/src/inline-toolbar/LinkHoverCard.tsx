// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// LinkHoverCard — hover any <a> inside .rune-editor → card with the
// href, a Copy button, and an Edit button. Edit swaps in LinkEditForm
// at the same range. Mounted as a sibling of InlineToolbar in
// RuneEditor.
//
// Anchoring uses Radix Popover with virtualRef → getBoundingClientRect
// of the hovered <a>. Same pattern as InlineToolbar.
//
// Mutual exclusion with InlineToolbar: the hover card only opens while
// the selection is collapsed. A non-collapsed TextSelection means the
// formatting toolbar is showing; suppress hover entirely.
//
// Safe travel link↔card: a 150 ms grace timer holds the card open
// while the cursor moves between the link and the card surface.
// pointerenter / pointerleave on each end cancel/schedule the timer.
//
// Edit mode disables hover-close (clicking inside the form mustn't
// dismiss it); Radix's default outside-click + the form's own Esc /
// Enter handlers own dismissal in that mode.
import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { getMarkRange } from "@tiptap/core"
// Side-effect: load Link's Commands<> augmentation.
import "@tiptap/extension-link"
import { Button } from "../components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "../components/ui/popover"
import { useStableVirtualElement } from "../components/ui/useStableVirtualElement"
import { useRangeAnchor } from "../positioning"
import { useLockedPopoverSide } from "../components/ui/useLockedPopoverSide"
import { GlobeIcon, CopyIcon } from "../icons"
import { useRuneEditorState } from "../useRuneEditorState"
import { LinkEditForm } from "./LinkEditForm"

const CARD_ATTR = "data-rune-link-hover-card"
const CARD_COPY_ATTR = "data-rune-link-hover-card-copy"
const CARD_EDIT_ATTR = "data-rune-link-hover-card-edit"
const GRACE_MS = 150

interface LinkState {
  mode: "hover" | "edit"
  href: string
  range: { from: number; to: number }
}

export interface LinkHoverCardProps {
  editor: Editor
}

export function LinkHoverCard({ editor }: LinkHoverCardProps) {
  const [state, setState] = useState<LinkState | null>(null)
  const editable = useRuneEditorState(editor, (current) => current.isEditable, {
    events: ["update"],
  })
  const overLinkRef = useRef(false)
  const overCardRef = useRef(false)
  const closeTimerRef = useRef<number | null>(null)
  const stateRef = useRef<LinkState | null>(null)
  stateRef.current = state

  // Snap out of edit mode when readonly is toggled on. The Edit button
  // itself is rendered from the useRuneEditorState editable snapshot.
  // setEditable() emits Tiptap's 'update' event but doesn't dispatch a PM
  // transaction.
  useEffect(() => {
    if (!editable) {
      setState((prev) =>
        prev?.mode === "edit" ? { ...prev, mode: "hover" } : prev,
      )
    }
  }, [editable])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      // Edit mode: don't auto-close on hover loss; outside-click /
      // Esc / save own dismissal.
      if (stateRef.current?.mode === "edit") return
      if (!overLinkRef.current && !overCardRef.current) setState(null)
    }, GRACE_MS)
  }, [cancelClose])

  const close = useCallback(() => {
    cancelClose()
    overLinkRef.current = false
    overCardRef.current = false
    setState(null)
  }, [cancelClose])

  // Hover detection on the editor's DOM root.
  useEffect(() => {
    const root = editor.view.dom
    const linkType = editor.schema.marks.link
    if (!linkType) return

    const onOver = (e: PointerEvent) => {
      // Only react to mouse — skip touch / pen so tap behavior stays
      // predictable on devices that emit synthetic mouseover.
      if (e.pointerType !== "mouse") return
      const target = e.target as Element | null
      const a = target?.closest("a")
      if (!a || !root.contains(a)) return
      // Mutual exclusion with InlineToolbar.
      const sel = editor.state.selection
      if (!(sel instanceof TextSelection) || sel.from !== sel.to) return

      const pos = editor.view.posAtDOM(a, 0)
      const $pos = editor.state.doc.resolve(Math.min(pos + 1, editor.state.doc.content.size))
      const range = getMarkRange($pos, linkType)
      if (!range) return

      const href = a.getAttribute("href") ?? ""

      overLinkRef.current = true
      cancelClose()
      // Avoid stomping an open EDIT-mode card on incidental re-hover
      // of the same link.
      if (stateRef.current?.mode === "edit") return
      setState((prev) => {
        if (
          prev &&
          prev.mode === "hover" &&
          prev.href === href &&
          prev.range.from === range.from &&
          prev.range.to === range.to
        ) {
          return prev
        }
        return { mode: "hover", href, range }
      })
    }

    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const target = e.target as Element | null
      const a = target?.closest("a")
      if (!a || !root.contains(a)) return
      const related = e.relatedTarget as Element | null
      // Moving inside the same anchor (e.g. across its child text node)
      // — ignore.
      if (related && a.contains(related)) return
      // Moving onto the hover card — keep open. Card listeners take it
      // from here.
      if (related && related.closest(`[${CARD_ATTR}]`)) {
        overLinkRef.current = false
        return
      }
      overLinkRef.current = false
      scheduleClose()
    }

    root.addEventListener("pointerover", onOver)
    root.addEventListener("pointerout", onOut)
    return () => {
      root.removeEventListener("pointerover", onOver)
      root.removeEventListener("pointerout", onOut)
    }
  }, [editor, cancelClose, scheduleClose])

  // Close on text-selection or when the link mark goes away (e.g.
  // user removed it via the toolbar).
  useEffect(() => {
    const onSel = () => {
      const sel = editor.state.selection
      if (!(sel instanceof TextSelection) || sel.from !== sel.to) {
        close()
      }
    }
    editor.on("selectionUpdate", onSel)
    return () => {
      editor.off("selectionUpdate", onSel)
    }
  }, [editor, close])

  // Cleanup any pending timer on unmount.
  useEffect(() => () => cancelClose(), [cancelClose])

  // Live anchor over the link mark's range — its contextElement lets floating-ui
  // re-position the card on inner-container scroll, no manual scroll handler.
  const linkAnchor = useRangeAnchor(editor, state?.range ?? null)
  const virtualRef = useStableVirtualElement(linkAnchor)

  // Pin the resolved side once Radix has flipped for the initial open so
  // the hover→edit transition (small URL chip → taller LinkEditForm)
  // doesn't make the card jump over the link. Keyed on range.from so
  // hovering a different link (cross-link without a close) re-decides.
  // See useLockedPopoverSide JSDoc.
  const { contentRef, lockedSide, avoidCollisions } = useLockedPopoverSide(
    state?.range.from ?? null,
  )

  if (!state || !virtualRef) return null

  const isEdit = state.mode === "edit"

  return (
    <Popover
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        ref={contentRef}
        side={lockedSide ?? "bottom"}
        avoidCollisions={avoidCollisions}
        align="start"
        sideOffset={6}
        // Hover mode: popover should not steal focus on open (would
        // collapse any caret/typing). Edit mode: let Radix's default
        // auto-focus-first run so the URL input gets focus.
        onOpenAutoFocus={(e) => {
          if (!isEdit) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Edit mode: Esc and focus-outside are owned by LinkEditForm —
        // its input onKeyDown discards the draft (sets
        // shouldSaveOnUnmountRef=false) before calling onClose.
        // Radix's useEscapeKeydown is capture-phase at document level
        // and would unmount the form before handleKey runs, committing
        // the discarded edit. Same root cause as InlineToolbar #75/#77
        // (Esc) and #72 (focus-outside on Cmd-Tab). Hover mode keeps
        // Radix defaults so Esc / outside-click dismiss as expected.
        onEscapeKeyDown={(e) => {
          if (isEdit) e.preventDefault()
        }}
        onFocusOutside={(e) => {
          if (isEdit) e.preventDefault()
        }}
        onPointerEnter={() => {
          overCardRef.current = true
          cancelClose()
        }}
        onPointerLeave={(e) => {
          // When pointer leaves the popover toward the link itself,
          // the link's pointerover re-affirms; treat the same as hover
          // mode. In edit mode we don't auto-close anyway.
          const related = (e.relatedTarget as Element | null) ?? null
          if (related && related.closest("a")) {
            overCardRef.current = false
            return
          }
          overCardRef.current = false
          scheduleClose()
        }}
        className="w-fit rounded-lg p-1 shadow-lg ring-1 ring-foreground/10 bg-popover text-popover-foreground"
        {...{ [CARD_ATTR]: "" }}
      >
        {isEdit ? (
          <LinkEditForm
            key={`${state.range.from}-${state.range.to}`}
            editor={editor}
            href={state.href}
            range={state.range}
            onClose={close}
          />
        ) : (
          <HoverCardBody
            href={state.href}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(state.href)
              } catch {
                // ignore — clipboard API may be unavailable in some
                // browsers / iframes; non-fatal.
              }
            }}
            onEdit={
              editable
                ? () => setState((prev) => (prev ? { ...prev, mode: "edit" } : prev))
                : null
            }
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

interface HoverCardBodyProps {
  href: string
  onCopy: () => void
  /** null hides the Edit button — used when editor is readonly. */
  onEdit: (() => void) | null
}

function HoverCardBody({ href, onCopy, onEdit }: HoverCardBodyProps) {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5 max-w-md">
      <GlobeIcon className="size-3.5 text-muted-foreground shrink-0" />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm truncate underline-offset-2 hover:underline max-w-72"
        title={href}
      >
        {href}
      </a>
      <span className="mx-1 h-4 w-px bg-foreground/10" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy link"
        {...{ [CARD_COPY_ATTR]: "" }}
        onClick={onCopy}
      >
        <CopyIcon className="size-3.5" />
      </Button>
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Edit link"
          {...{ [CARD_EDIT_ATTR]: "" }}
          onClick={onEdit}
        >
          Edit
        </Button>
      )}
    </div>
  )
}
