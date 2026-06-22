// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { entityRefsRefreshKey, type EntityRefsRefreshMeta } from "."
import { runePluginKeyName } from "../plugin-key-name"

export interface RefDecorationConfig<Attrs = unknown> {
  /** Stable identifier used by `refreshEntityRefs(refType)` to scope refreshes. */
  refType: string
  /** Set for inline mark refs. Mutually exclusive with `nodeName`. */
  markName?: string
  /** Set for block node refs. Mutually exclusive with `markName`. */
  nodeName?: string
  /**
   * Host callback. Return DOM attrs to merge into the decoration for this
   * ref instance, or `null`/`undefined` to skip emitting a decoration for
   * it. Called once per ref instance per rebuild — must be O(1) (memo'd
   * lookups against a Map/Set, not array scans).
   */
  deriveAttrs?: (attrs: Attrs) => Record<string, string> | null | undefined
  /**
   * Optional stable key for per-target memoization. **Currently unused** —
   * captured for forward-compatible caching only; the factory always
   * re-invokes `deriveAttrs` on every rebuild. Will be honored once a real
   * profiling hotspot motivates the cache layer. Safe to set today as
   * documentation of which attr is the natural identity (e.g. `target`).
   */
  getKey?: (attrs: Attrs) => string
}

interface RefDecorationState {
  decorations: DecorationSet
}

export function isTargetedRefresh(tr: Transaction, refType: string) {
  const meta = tr.getMeta(entityRefsRefreshKey) as EntityRefsRefreshMeta | undefined
  return !!meta && (meta.refType === null || meta.refType === refType)
}

function hasAttrs(attrs: Record<string, string> | null | undefined): attrs is Record<string, string> {
  return !!attrs && Object.keys(attrs).length > 0
}

function sameAttrs(a: Record<string, unknown>, b: Record<string, unknown>) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

function markDecorations<Attrs>({
  doc,
  markName,
  deriveAttrs,
}: {
  doc: ProseMirrorNode
  markName: string
  deriveAttrs?: (attrs: Attrs) => Record<string, string> | null | undefined
}) {
  if (!deriveAttrs) return DecorationSet.empty

  const decorations: Decoration[] = []
  let active:
    | {
        from: number
        to: number
        attrs: Record<string, unknown>
        decorationAttrs: Record<string, string>
      }
    | null = null

  const flush = () => {
    if (!active) return
    decorations.push(Decoration.inline(active.from, active.to, active.decorationAttrs))
    active = null
  }

  doc.descendants((node, pos) => {
    if (!node.isInline) {
      flush()
      return true
    }

    const mark = node.marks.find((candidate) => candidate.type.name === markName)
    if (!mark) {
      flush()
      return false
    }

    const from = pos
    const to = pos + node.nodeSize
    const decorationAttrs = deriveAttrs(mark.attrs as Attrs)
    if (!hasAttrs(decorationAttrs)) {
      flush()
      return false
    }

    if (active && active.to === from && sameAttrs(active.attrs, mark.attrs)) {
      active.to = to
      return false
    }

    flush()
    active = {
      from,
      to,
      attrs: mark.attrs,
      decorationAttrs,
    }
    return false
  })
  flush()

  return DecorationSet.create(doc, decorations)
}

function nodeDecorations<Attrs>({
  doc,
  nodeName,
  deriveAttrs,
}: {
  doc: ProseMirrorNode
  nodeName: string
  deriveAttrs?: (attrs: Attrs) => Record<string, string> | null | undefined
}) {
  if (!deriveAttrs) return DecorationSet.empty

  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) return true
    const attrs = deriveAttrs(node.attrs as Attrs)
    if (hasAttrs(attrs)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs))
    }
    return false
  })

  return DecorationSet.create(doc, decorations)
}

function buildDecorations<Attrs>(
  doc: ProseMirrorNode,
  config: RefDecorationConfig<Attrs>,
) {
  if (config.markName && config.nodeName) {
    throw new Error("createRefDecorationPlugin requires markName or nodeName, not both")
  }
  if (!config.markName && !config.nodeName) {
    throw new Error("createRefDecorationPlugin requires either markName or nodeName")
  }

  if (config.markName) {
    return markDecorations({
      doc,
      markName: config.markName,
      deriveAttrs: config.deriveAttrs,
    })
  }

  return nodeDecorations({
    doc,
    nodeName: config.nodeName!,
    deriveAttrs: config.deriveAttrs,
  })
}

export function createRefDecorationPlugin<Attrs>(
  config: RefDecorationConfig<Attrs>,
): Plugin<RefDecorationState> {
  // getKey is forward-compat (see field JSDoc). Reference once so TypeScript's
  // noUnusedParameters / linter doesn't trip on hosts that pass it today.
  void config.getKey

  return new Plugin<RefDecorationState>({
    key: new PluginKey(runePluginKeyName("entity-ref-decoration", config.refType)),
    state: {
      init: (_, state) => ({
        decorations: buildDecorations(state.doc, config),
      }),
      apply(tr, prev, _oldState, newState) {
        if (tr.docChanged || isTargetedRefresh(tr, config.refType)) {
          return {
            decorations: buildDecorations(newState.doc, config),
          }
        }
        return {
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        }
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
  })
}
