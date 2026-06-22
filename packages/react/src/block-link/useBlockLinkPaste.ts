// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { BlockLinkPasteState } from "./BlockLinkPasteMenu"
import type {
  ParseRuneBlockLink,
  RuneBlockLinkTarget,
  ResolveRuneRef,
  RuneRefResolveResult,
} from "./types"

interface PendingPaste {
  href: string
  target: RuneBlockLinkTarget
  selectionFrom: number
}

export interface UseBlockLinkPasteOptions {
  editor: Editor | null
  parseBlockLink?: ParseRuneBlockLink
  resolveRef?: ResolveRuneRef
}

export interface UseBlockLinkPasteResult {
  state: BlockLinkPasteState | null
  chooseMention: () => Promise<void>
  chooseUrl: () => void
  close: () => void
}

function isSingleLineText(text: string): boolean {
  return text !== "" && !/[\r\n]/.test(text)
}

function normalizeDisplayText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

interface TextRangeMatch { from: number; to: number; distance: number }

function findTextRangeNear(editor: Editor, href: string, near: number): { from: number; to: number } | null {
  let best: TextRangeMatch | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    let index = node.text.indexOf(href)
    while (index >= 0) {
      const from = pos + index
      const to = from + href.length
      const distance = Math.abs(from - near)
      if (!best || distance < best.distance) best = { from, to, distance }
      index = node.text.indexOf(href, index + 1)
    }
    return true
  })
  return best ? { from: (best as TextRangeMatch).from, to: (best as TextRangeMatch).to } : null
}

function rangeText(editor: Editor, range: { from: number; to: number }): string {
  if (range.from < 0 || range.to > editor.state.doc.content.size || range.from > range.to) {
    return ""
  }
  return editor.state.doc.textBetween(range.from, range.to, "", "")
}

export function useBlockLinkPaste({
  editor,
  parseBlockLink,
  resolveRef,
}: UseBlockLinkPasteOptions): UseBlockLinkPasteResult {
  const [state, setState] = useState<BlockLinkPasteState | null>(null)
  const stateRef = useRef<BlockLinkPasteState | null>(null)
  const pendingPasteRef = useRef<PendingPaste | null>(null)
  const resolveRefRef = useRef(resolveRef)
  stateRef.current = state
  resolveRefRef.current = resolveRef

  const close = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!editor || !parseBlockLink || !resolveRef) {
      pendingPasteRef.current = null
      setState(null)
      return
    }

    const root = editor.view.dom
    const locate = () => {
      const pending = pendingPasteRef.current
      pendingPasteRef.current = null
      if (!pending || editor.isDestroyed) return
      const range = findTextRangeNear(editor, pending.href, pending.selectionFrom)
      if (!range) return
      setState({
        href: pending.href,
        target: pending.target,
        range,
        pending: false,
        error: false,
      })
    }

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain").trim() ?? ""
      if (!isSingleLineText(text)) return
      const selection = editor.state.selection
      if (!(selection instanceof TextSelection) || selection.from !== selection.to) return
      const target = parseBlockLink(text)
      if (!target) return
      pendingPasteRef.current = { href: text, target, selectionFrom: selection.from }
      window.requestAnimationFrame(locate)
    }

    root.addEventListener("paste", onPaste, true)
    return () => {
      root.removeEventListener("paste", onPaste, true)
    }
  }, [editor, parseBlockLink, resolveRef])

  const chooseUrl = useCallback(() => {
    setState(null)
  }, [])

  const chooseMention = useCallback(async () => {
    const current = stateRef.current
    const resolver = resolveRefRef.current
    if (!editor || !current || !resolver) return
    setState({ ...current, pending: true, error: false })
    let result: RuneRefResolveResult | null
    const attrs = { kind: "block" as const, target: current.target.refTarget }
    try {
      result = await resolver({ editor, attrs })
    } catch {
      const latest = stateRef.current
      if (latest && latest.href === current.href) {
        setState({ ...latest, pending: false, error: true })
      }
      return
    }
    const latest = stateRef.current
    if (!latest || latest.href !== current.href) return
    const text = result?.displayText ? normalizeDisplayText(result.displayText) : ""
    if (!text) {
      setState({ ...latest, pending: false, error: true })
      return
    }
    if (rangeText(editor, latest.range) !== latest.href) {
      setState(null)
      return
    }
    const from = latest.range.from
    const to = from + text.length
    const ok = editor
      .chain()
      .focus()
      .insertContentAt(latest.range, text, { updateSelection: false })
      .setTextSelection({ from, to })
      .setInternalRef(attrs)
      .setTextSelection(to)
      .run()
    if (!ok) {
      setState({ ...latest, pending: false, error: true })
      return
    }
    setState(null)
  }, [editor])

  return { state, chooseMention, chooseUrl, close }
}
