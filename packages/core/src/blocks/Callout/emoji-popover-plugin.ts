// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension, type Editor, type RawCommands } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorState, Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Tracks which callout's emoji icon was clicked, so the React layer can
 * mount an emoji-picker popover anchored to it. Mirrors the MediaPopover
 * plugin: a tiny state plugin holding `activeBlockId`, opened by a click on
 * the `.rune-callout-icon` chrome and closed on selection move / read-only /
 * block removal. Core stays React- and DOM-render-free — it only reads the
 * click target and dispatches metas.
 */
export interface CalloutEmojiPopoverState {
  activeBlockId: string | null
}

type CalloutEmojiPopoverMeta =
  | { type: "open"; blockId: string }
  | { type: "close" }

export const calloutEmojiPopoverPluginKey =
  new PluginKey<CalloutEmojiPopoverState>("rune-callout-emoji-popover")

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calloutEmojiPopover: {
      openCalloutEmojiPopover: (blockId: string) => ReturnType
      closeCalloutEmojiPopover: () => ReturnType
      /** Set a callout's emoji icon without rebuilding the block (content-safe). */
      setCalloutIcon: (blockId: string, icon: string) => ReturnType
    }
  }
}

export function getCalloutEmojiPopoverBlockId(editor: Editor): string | null {
  return calloutEmojiPopoverPluginKey.getState(editor.state)?.activeBlockId ?? null
}

/**
 * Locate a callout node by id anywhere in the doc — top-level, nested
 * (depth>0), or inside a column surface — via a single descendants scan.
 * `topLevelBlockPosById` would miss callouts living inside a column.
 */
function calloutPosById(
  doc: ProseMirrorNode,
  id: string,
): { pos: number; node: ProseMirrorNode } | null {
  let found: { pos: number; node: ProseMirrorNode } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === "callout" && node.attrs.id === id) {
      found = { pos, node }
      return false
    }
    return true
  })
  return found
}

function canOpen(editor: Editor, state: EditorState, blockId: string): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false
  return calloutPosById(state.doc, blockId) !== null
}

function applyMeta(
  editor: Editor,
  tr: Transaction,
  value: CalloutEmojiPopoverState,
  newState: EditorState,
): CalloutEmojiPopoverState {
  const meta = tr.getMeta(calloutEmojiPopoverPluginKey) as
    | CalloutEmojiPopoverMeta
    | undefined

  if (meta?.type === "close") return { activeBlockId: null }
  if (meta?.type === "open") {
    return {
      activeBlockId: canOpen(editor, newState, meta.blockId) ? meta.blockId : null,
    }
  }

  const activeBlockId = value.activeBlockId
  if (!activeBlockId) return value
  if (!editor.isEditable) return { activeBlockId: null }
  // Moving the selection (clicking into text, arrow keys, clicking another
  // block) dismisses the picker — same contract MediaPopover uses.
  if (tr.selectionSet) return { activeBlockId: null }
  if (!calloutPosById(newState.doc, activeBlockId)) return { activeBlockId: null }
  return value
}

function openFromIconClick(
  editor: Editor,
  view: EditorView,
  event: MouseEvent,
): boolean {
  if (!view.editable || !editor.isEditable || editor.isDestroyed) return false
  const target = event.target
  if (!(target instanceof Element)) return false

  const icon = target.closest(".rune-callout-icon")
  if (!icon) return false
  const block = icon.closest<HTMLElement>(".rune-block.rune-callout[data-id]")
  const blockId = block?.getAttribute("data-id")
  if (!blockId || !canOpen(editor, view.state, blockId)) return false

  // Stop PM from placing a text selection on the contenteditable=false icon.
  event.preventDefault()
  view.dispatch(
    view.state.tr
      .setMeta(calloutEmojiPopoverPluginKey, {
        type: "open",
        blockId,
      } satisfies CalloutEmojiPopoverMeta)
      .setMeta("addToHistory", false),
  )
  return true
}

function closeIfReadOnly(editor: Editor, view: EditorView): void {
  if (editor.isDestroyed) return
  if (editor.isEditable && view.editable) return
  if (!calloutEmojiPopoverPluginKey.getState(view.state)?.activeBlockId) return
  view.dispatch(
    view.state.tr
      .setMeta(calloutEmojiPopoverPluginKey, { type: "close" } satisfies CalloutEmojiPopoverMeta)
      .setMeta("addToHistory", false),
  )
}

export const CalloutEmojiPopover = Extension.create({
  name: "calloutEmojiPopover",

  addCommands() {
    return {
      openCalloutEmojiPopover:
        (blockId) =>
        ({ editor, state, dispatch }) => {
          if (!canOpen(editor, state, blockId)) return false
          if (!dispatch) return true
          dispatch(
            state.tr
              .setMeta(calloutEmojiPopoverPluginKey, {
                type: "open",
                blockId,
              } satisfies CalloutEmojiPopoverMeta)
              .setMeta("addToHistory", false),
          )
          return true
        },

      closeCalloutEmojiPopover:
        () =>
        ({ state, dispatch }) => {
          if (!dispatch) return true
          dispatch(
            state.tr
              .setMeta(calloutEmojiPopoverPluginKey, { type: "close" } satisfies CalloutEmojiPopoverMeta)
              .setMeta("addToHistory", false),
          )
          return true
        },

      setCalloutIcon:
        (blockId, icon) =>
        ({ state, dispatch }) => {
          const found = calloutPosById(state.doc, blockId)
          if (!found) return false
          if (!dispatch) return true
          const next =
            typeof icon === "string" && icon.length > 0
              ? icon
              : (found.node.attrs.icon as string)
          // setNodeAttribute is surgical — it changes only `icon` and leaves
          // the inline content untouched (updateBlock can drop content).
          dispatch(state.tr.setNodeAttribute(found.pos, "icon", next))
          return true
        },
    } as Partial<RawCommands>
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<CalloutEmojiPopoverState>({
        key: calloutEmojiPopoverPluginKey,
        state: {
          init: () => ({ activeBlockId: null }),
          apply: (tr, value, _oldState, newState) =>
            applyMeta(editor, tr, value, newState),
        },
        props: {
          handleDOMEvents: {
            click: (view, event) =>
              openFromIconClick(editor, view, event as MouseEvent),
          },
          handleClick: (view, _pos, event) =>
            openFromIconClick(editor, view, event),
        },
        view: (view) => ({
          update: () => closeIfReadOnly(editor, view),
        }),
      }),
    ]
  },
})
