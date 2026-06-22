// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { TextSelection } from "@tiptap/pm/state"
import type { Transaction } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { entityRefsRefreshKey } from "../entity-refs"
import type { InternalRefAttrs, InternalRefResolveResult } from "."
import { createLabelSyncPlugin, internalRefLabelSyncKey } from "./labelSyncPlugin"

const REF_HTML = (text: string) =>
  `<p>before <a data-rune-ref-kind="page" data-rune-ref-target="note-1">${text}</a> after</p>`

function makeResolver(labels: Map<string, string>) {
  return (attrs: InternalRefAttrs): InternalRefResolveResult | null => {
    const label = labels.get(attrs.target)
    if (label === undefined) return null
    return { displayText: label }
  }
}

function makeSyncEditor({
  labels,
  syncLabel = true,
  resolve = makeResolver(labels),
  content = REF_HTML("Old"),
}: {
  labels: Map<string, string>
  syncLabel?: boolean
  resolve?: ((attrs: InternalRefAttrs) => InternalRefResolveResult | null) | undefined
  content?: string
}) {
  return createTestEditor({
    kit: { internalRef: { resolve, syncLabel } },
    content,
  })
}

interface RefRunProbe {
  from: number
  to: number
  text: string
  marks: string[]
}

function refRun(editor: ReturnType<typeof createTestEditor>): RefRunProbe | null {
  let found: RefRunProbe | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true
    const mark = node.marks.find((m) => m.type.name === "internalRef")
    if (!mark) return true
    found = {
      from: pos,
      to: pos + node.nodeSize,
      text: node.text ?? "",
      marks: node.marks.map((m) => m.type.name),
    }
    return false
  })
  return found
}

describe("InternalRef labelSync — heals stale labels", () => {
  it("rewrites the run text when the resolver disagrees (initial mount pass)", () => {
    const labels = new Map([["note-1", "New"]])
    const editor = makeSyncEditor({ labels })

    // The Editor ctor parses `content` transaction-free (EditorState.create),
    // so no docChanged tr fires at mount — the plugin's own view() pass does
    // the first sync. (This id-less seed also gets a BlockId backfill tr,
    // but the test below pins the view() pass without that crutch.)
    expect(refRun(editor)?.text).toBe("New")
    expect(editor.getText()).toContain("before New after")
  })

  it("heals a stale label at mount when seed HTML already carries block ids", () => {
    // Every block in this seed has data-id/data-depth, so BlockId's own
    // view() backfill finds nothing to fill and dispatches NO transaction.
    // There is no docChanged tr to piggyback on — only the sync plugin's
    // own view() pass can heal the stale label here.
    const labels = new Map([["note-1", "New"]])
    const editor = makeSyncEditor({
      labels,
      content:
        '<p data-id="blk-1" data-depth="0">before <a data-rune-ref-kind="page" data-rune-ref-target="note-1">Old</a> after</p>',
    })

    expect(refRun(editor)?.text).toBe("New")
  })

  it("heals on refreshEntityRefs after the consumer's cache mutates (rename)", () => {
    const labels = new Map([["note-1", "Old"]])
    const editor = makeSyncEditor({ labels })
    expect(refRun(editor)?.text).toBe("Old")

    labels.set("note-1", "Project Y")
    editor.commands.refreshEntityRefs("internalRef")

    expect(refRun(editor)?.text).toBe("Project Y")
  })

  it("keeps kind/target attrs and the mark itself across a rewrite", () => {
    const labels = new Map([["note-1", "Renamed"]])
    const editor = makeSyncEditor({ labels })

    const run = refRun(editor)
    expect(run?.text).toBe("Renamed")
    const mark = editor.state.doc
      .nodeAt(run!.from)!
      .marks.find((m) => m.type.name === "internalRef")!
    expect(mark.attrs).toMatchObject({ kind: "page", target: "note-1" })
  })

  it("preserves co-marks (a bold mention stays bold)", () => {
    const labels = new Map([["note-1", "New"]])
    const editor = makeSyncEditor({
      labels,
      content:
        '<p><strong><a data-rune-ref-kind="page" data-rune-ref-target="note-1">Old</a></strong></p>',
    })

    const run = refRun(editor)
    expect(run?.text).toBe("New")
    expect(run?.marks).toContain("bold")
    expect(run?.marks).toContain("internalRef")
  })

  it("syncs the label even when only refreshEntityRefs() (no refType) fires", () => {
    const labels = new Map([["note-1", "Old"]])
    const editor = makeSyncEditor({ labels })

    labels.set("note-1", "Broadcast")
    editor.commands.refreshEntityRefs()

    expect(refRun(editor)?.text).toBe("Broadcast")
  })
})

describe("InternalRef labelSync — cached-fallback + guards", () => {
  it("resolver null (deleted target) never wipes the existing text", () => {
    const labels = new Map<string, string>()
    const editor = makeSyncEditor({ labels })

    editor.commands.refreshEntityRefs("internalRef")

    expect(refRun(editor)?.text).toBe("Old")
  })

  it("empty displayText is ignored — a buggy resolver can't blank a mention", () => {
    const labels = new Map([["note-1", ""]])
    const editor = makeSyncEditor({ labels })

    editor.commands.refreshEntityRefs("internalRef")

    expect(refRun(editor)?.text).toBe("Old")
  })

  it("is idempotent: appendTransaction yields null when every label is in sync", () => {
    // Unit guard for the no-rewrite-loop property: an in-sync doc must
    // produce NO transaction at all. Built standalone (syncLabel off on
    // the editor) so we exercise the plugin's appendTransaction directly
    // — a live always-rewrite bug would hang the dispatch cycle before
    // any event-level assertion could run.
    const labels = new Map([["note-1", "Stable"]])
    const editor = makeSyncEditor({
      labels,
      syncLabel: false,
      content: REF_HTML("Stable"),
    })
    expect(refRun(editor)?.text).toBe("Stable")

    const plugin = createLabelSyncPlugin({
      markName: "internalRef",
      refType: "internalRef",
      resolve: makeResolver(labels),
    })
    const refreshTr = editor.state.tr.setMeta(entityRefsRefreshKey, {
      refType: "internalRef",
    })
    const appended = plugin.spec.appendTransaction!.call(
      plugin,
      [refreshTr],
      editor.state,
      editor.state,
    ) as Transaction | null

    expect(appended).toBeNull()
  })

  it("is idempotent: a refresh with an already-synced label appends no doc-changing transaction", () => {
    const labels = new Map([["note-1", "Stable"]])
    const editor = makeSyncEditor({ labels })
    expect(refRun(editor)?.text).toBe("Stable")

    // Tiptap v3 emits the ROOT dispatched tr as `transaction` — the
    // refresh root tr never has docChanged, so asserting on it is
    // vacuous. Sync rewrites surface only in `appendedTransactions`;
    // filter those for docChanged.
    const appendedDocChanges: Transaction[] = []
    editor.on("transaction", ({ appendedTransactions }) => {
      for (const tr of appendedTransactions) {
        if (tr.docChanged) appendedDocChanges.push(tr)
      }
    })
    editor.commands.refreshEntityRefs("internalRef")

    expect(appendedDocChanges).toHaveLength(0)
  })

  it("stamps the sync meta + addToHistory:false so undo never replays a rewrite", () => {
    const labels = new Map([["note-1", "Old"]])
    const editor = makeSyncEditor({ labels })

    // Tiptap's `transaction` event only reports the dispatched tr, not
    // appended ones — invoke the plugin's appendTransaction directly to
    // inspect the produced transaction's metas.
    const plugin = internalRefLabelSyncKey.get(editor.state)!
    labels.set("note-1", "New")
    const refreshTr = editor.state.tr.setMeta(entityRefsRefreshKey, {
      refType: "internalRef",
    })
    const appended = plugin.spec.appendTransaction!.call(
      plugin,
      [refreshTr],
      editor.state,
      editor.state,
    ) as Transaction | null

    expect(appended).not.toBeNull()
    expect(appended!.getMeta(internalRefLabelSyncKey)).toBe(true)
    expect(appended!.getMeta("addToHistory")).toBe(false)

    // And through the real command path: the rewrite lands but is not
    // undoable as its own history step.
    editor.commands.refreshEntityRefs("internalRef")
    expect(refRun(editor)?.text).toBe("New")
    editor.commands.undo()
    expect(refRun(editor)?.text).toBe("New")
  })
})

describe("InternalRef labelSync — opt-in gating (no-regression)", () => {
  it("syncLabel off ⇒ text frozen even with a resolver wired", () => {
    const labels = new Map([["note-1", "New"]])
    const editor = makeSyncEditor({ labels, syncLabel: false })

    editor.commands.refreshEntityRefs("internalRef")

    expect(refRun(editor)?.text).toBe("Old")
  })

  it("resolve undefined ⇒ syncLabel alone does nothing", () => {
    const editor = makeSyncEditor({
      labels: new Map(),
      resolve: undefined,
      syncLabel: true,
    })

    editor.commands.refreshEntityRefs("internalRef")

    expect(refRun(editor)?.text).toBe("Old")
  })
})

describe("InternalRef labelSync — selection safety (skip-and-defer)", () => {
  it("defers a run under the caret, then heals once the caret leaves", () => {
    const labels = new Map([["note-1", "Old"]])
    const editor = makeSyncEditor({ labels })
    const run = refRun(editor)!

    // Park the caret strictly inside the mention.
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, run.from + 1),
      ),
    )

    labels.set("note-1", "New")
    editor.commands.refreshEntityRefs("internalRef")
    expect(refRun(editor)?.text).toBe("Old")

    // Caret moves out → the next pass heals the deferred run.
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)),
    )
    editor.commands.refreshEntityRefs("internalRef")
    expect(refRun(editor)?.text).toBe("New")
  })
})

describe("InternalRef labelSync — multiple refs in one doc", () => {
  it("rewrites every stale run in a single pass, later positions first", () => {
    const labels = new Map([
      ["a", "Alpha2"],
      ["b", "Beta2"],
    ])
    const editor = makeSyncEditor({
      labels,
      content:
        '<p><a data-rune-ref-kind="page" data-rune-ref-target="a">Alpha</a> mid <a data-rune-ref-kind="block" data-rune-ref-target="b">Beta</a></p>',
    })

    expect(editor.getText()).toContain("Alpha2 mid Beta2")
  })
})

// ---------------------------------------------------------------------------
// IR-alias probe: aliased refs must NOT have their text rewritten on rename
// Probe for the #312 regression — labelSync clobbered deliberate alias text.
// ---------------------------------------------------------------------------
describe("InternalRef labelSync — alias exemption (#312 regression probe)", () => {
  it("does NOT rewrite an aliased run even when the resolver returns a different displayText", () => {
    // An aliased ref has alias:true on the mark. The user deliberately chose
    // "Bar" as the display text for target "Foo"; the resolver may return
    // displayText:"Foo" but that must NOT clobber "Bar".
    const labels = new Map([["note-1", "Renamed"]])
    const editor = makeSyncEditor({
      labels,
      content:
        '<p><a data-rune-ref-kind="page" data-rune-ref-target="note-1" data-rune-ref-alias="true">Bar</a></p>',
    })

    // The aliased run must NOT be rewritten.
    expect(refRun(editor)?.text).toBe("Bar")
  })

  it("heals the non-aliased run while keeping an aliased run in the same doc", () => {
    // Two refs: first is aliased (must keep text "AliasText"),
    // second is a plain mention (must be healed from "StaleLabel" to "Renamed").
    const labels = new Map([
      ["note-1", "Renamed"],
      ["note-2", "Renamed2"],
    ])
    const editor = makeSyncEditor({
      labels,
      content:
        '<p><a data-rune-ref-kind="page" data-rune-ref-target="note-1" data-rune-ref-alias="true">AliasText</a> mid <a data-rune-ref-kind="page" data-rune-ref-target="note-2">StaleLabel</a></p>',
    })

    let aliasText: string | undefined
    let plainText: string | undefined
    editor.state.doc.descendants((node) => {
      if (!node.isText) return true
      const mark = node.marks.find((m) => m.type.name === "internalRef")
      if (!mark) return true
      if (mark.attrs.alias) {
        aliasText = node.text ?? ""
      } else {
        plainText = node.text ?? ""
      }
      return false
    })

    expect(aliasText).toBe("AliasText")
    expect(plainText).toBe("Renamed2")
  })
})

// ---------------------------------------------------------------------------
// IR-3 probe: re-scanning sync output converges in one extra pass (no loop)
// ---------------------------------------------------------------------------
describe("InternalRef labelSync IR-3 — re-scan convergence (no infinite loop)", () => {
  it("re-scanning sync output produces null — convergence in exactly one extra pass", () => {
    // Contract: when appendTransaction receives a sync-tagged tr (PM's
    // internal loop calls appendTransaction a second time with the newly
    // appended sync tr), buildSyncTransaction runs on the already-rewritten
    // state and finds no drift → returns null. The loop terminates after
    // at most one extra pass regardless of resolver content.
    const labels = new Map([["note-1", "New"]])
    const plugin = createLabelSyncPlugin({
      markName: "internalRef",
      refType: "internalRef",
      resolve: makeResolver(labels),
    })

    const editor = makeSyncEditor({
      labels: new Map([["note-1", "Old"]]),
      syncLabel: false,
      content: REF_HTML("Old"),
    })

    // Pass 1: trigger a refresh, get the sync tr.
    labels.set("note-1", "New")
    const refreshTr = editor.state.tr.setMeta(entityRefsRefreshKey, {
      refType: "internalRef",
    })
    const syncTr = plugin.spec.appendTransaction!.call(
      plugin,
      [refreshTr],
      editor.state,
      editor.state,
    ) as Transaction | null

    expect(syncTr).not.toBeNull()
    expect(syncTr!.getMeta(internalRefLabelSyncKey)).toBe(true)

    // Pass 2: apply the sync tr and feed it back — simulates PM's own loop.
    // buildSyncTransaction on the now-correct state must find no drift → null.
    const syncedState = editor.state.apply(syncTr!)
    const secondPass = plugin.spec.appendTransaction!.call(
      plugin,
      [syncTr!],
      editor.state,
      syncedState,
    ) as Transaction | null

    expect(secondPass).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// IR-4 probe: mark intersection on multi-segment runs
// ---------------------------------------------------------------------------
describe("InternalRef labelSync IR-4 — mark intersection on multi-segment runs", () => {
  it("drops partial bold that spans only first segment, keeps run-wide marks", () => {
    // Build a mention whose label is split across two text nodes:
    //   node 1: "Old " — has [bold, internalRef]
    //   node 2: "Name" — has [internalRef] only
    // After rename to "New Name", the rewritten label must carry ONLY [internalRef]
    // (the intersection of {bold,internalRef} ∩ {internalRef} = {internalRef}).
    // Pre-fix: the whole rewritten label comes out bold (first node's marks stamped).
    const labels = new Map([["note-1", "New Name"]])

    // Build content with two adjacent text nodes inside the ref anchor:
    // <strong>Old </strong> + (plain) Name, both wrapped in the ref <a>.
    // HTML parse naturally creates two text nodes: one bold, one not.
    const editor = makeSyncEditor({
      labels,
      content:
        '<p><a data-rune-ref-kind="page" data-rune-ref-target="note-1"><strong>Old </strong>Name</a></p>',
    })

    // After mount sync the label should be "New Name"
    // Collect ALL text nodes inside the mention run to inspect each segment's marks.
    const segments: Array<{ text: string; marks: string[] }> = []
    editor.state.doc.descendants((node) => {
      if (!node.isText) return true
      const hasMark = node.marks.some((m) => m.type.name === "internalRef")
      if (!hasMark) return true
      segments.push({
        text: node.text ?? "",
        marks: node.marks.map((m) => m.type.name),
      })
      return false
    })

    // The sync should have rewritten to a single text node "New Name"
    // (replaceWith produces one text node). Its marks should be the intersection:
    // only [internalRef], no bold.
    expect(segments).toHaveLength(1)
    expect(segments[0]!.text).toBe("New Name")
    // IR-4 PROBE: pre-fix this contains "bold" (wrong); post-fix it must NOT.
    expect(segments[0]!.marks).not.toContain("bold")
    expect(segments[0]!.marks).toContain("internalRef")
  })
})
