// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  useMemo,
  useRef,
  useSyncExternalStore,
  type DependencyList,
} from "react"
import type { Editor } from "@tiptap/core"

export type RuneEditorStateEvent = "transaction" | "selectionUpdate" | "update"

export interface UseRuneEditorStateOptions<T> {
  /**
   * Tiptap editor events that should refresh the selector. Defaults to the
   * React chrome-safe set: transactions, which also cover selection changes,
   * plus editor updates such as setEditable().
   */
  events?: readonly RuneEditorStateEvent[]
  /** Equality used to skip React updates when the selected value is unchanged. */
  isEqual?: (prev: T, next: T) => boolean
  /**
   * Extra dependencies that should force a selector re-read even if the editor
   * has not emitted an event. Use this when the selector closes over props.
   */
  deps?: DependencyList
}

const DEFAULT_EVENTS: readonly RuneEditorStateEvent[] = [
  "transaction",
  "update",
]
const EMPTY_DEPS: DependencyList = []
const NULL_SNAPSHOT = null

function depsChanged(prev: DependencyList | null, next: DependencyList): boolean {
  if (prev === null) return true
  if (prev.length !== next.length) return true
  return next.some((value, index) => !Object.is(value, prev[index]))
}

export function useRuneEditorState<T>(
  editor: Editor,
  selector: (editor: Editor) => T,
  options?: UseRuneEditorStateOptions<T>,
): T
export function useRuneEditorState<T>(
  editor: Editor | null | undefined,
  selector: (editor: Editor) => T,
  options?: UseRuneEditorStateOptions<T>,
): T | null
export function useRuneEditorState<T>(
  editor: Editor | null | undefined,
  selector: (editor: Editor) => T,
  options: UseRuneEditorStateOptions<T> = {},
): T | null {
  const selectorRef = useRef(selector)
  const isEqualRef = useRef(options.isEqual ?? Object.is)
  const storeVersionRef = useRef(0)
  const cacheRef = useRef<{
    editor: Editor
    value: T
    storeVersion: number
    depsVersion: number
  } | null>(null)
  const depsRef = useRef<DependencyList | null>(null)
  const depsVersionRef = useRef(0)
  const deps = options.deps ?? EMPTY_DEPS
  const events = options.events ?? DEFAULT_EVENTS
  const eventKey = events.join("|")

  selectorRef.current = selector
  isEqualRef.current = options.isEqual ?? Object.is

  if (depsChanged(depsRef.current, deps)) {
    depsRef.current = deps
    depsVersionRef.current += 1
  }
  const depsVersion = depsVersionRef.current

  const eventList = useMemo(() => [...events], [eventKey])

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      if (!editor) return () => {}

      const handleStoreChange = () => {
        storeVersionRef.current += 1
        onStoreChange()
      }

      for (const event of eventList) editor.on(event, handleStoreChange)
      return () => {
        for (const event of eventList) editor.off(event, handleStoreChange)
      }
    },
    [editor, eventList],
  )

  const getSnapshot = useMemo(
    () => () => {
      if (!editor) return NULL_SNAPSHOT

      const cached = cacheRef.current
      const storeVersion = storeVersionRef.current
      if (
        cached?.editor === editor &&
        cached.storeVersion === storeVersion &&
        cached.depsVersion === depsVersion
      ) {
        return cached.value
      }

      const next = selectorRef.current(editor)
      if (
        cached?.editor === editor &&
        isEqualRef.current(cached.value, next)
      ) {
        cacheRef.current = {
          editor,
          value: cached.value,
          storeVersion,
          depsVersion,
        }
        return cached.value
      }

      cacheRef.current = { editor, value: next, storeVersion, depsVersion }
      return next
    },
    [editor, depsVersion],
  )

  return useSyncExternalStore(subscribe, getSnapshot, () => NULL_SNAPSHOT)
}
