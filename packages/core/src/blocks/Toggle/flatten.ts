// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Flatten <details>/<Notion-toggle> subtrees in `doc` IN PLACE into a
 * flat sequence of top-level block-level elements:
 *   - the title element (<p> or <hN>) tagged with `data-rune-toggle-title="1"`,
 *     `data-rune-toggle-level`, `data-rune-toggle-expanded`
 *   - the body's block-level children, each tagged with
 *     `data-rune-paste-depth="<n>"` (incremented by 1 relative to the
 *     toggle's own depth — which is 0 at the outermost call).
 *
 * Nested toggles are flattened recursively, with depths summed.
 *
 * Called from `clipboard/transformPastedHTML.ts` BEFORE the list flattener,
 * because both layers consume `data-rune-paste-depth` and the list
 * flattener walks `<ul>/<ol>` only — it ignores body blocks introduced
 * by us.
 */
export function transformToggleHTML(doc: Document): void {
  // Walk outermost-first; recursion happens inside `flattenOne`.
  while (true) {
    const root = pickRootToggle(doc)
    if (!root) break
    flattenOne(doc, root, 0)
  }
}

function pickRootToggle(doc: Document): HTMLElement | null {
  // <details> not inside a notion-toggle wrapper. Document order from
  // querySelectorAll already guarantees outermost-first; nested <details>
  // are handled by flattenOne's recursion at the body-element loop.
  const detailsCandidates = Array.from(doc.querySelectorAll("details")) as HTMLDetailsElement[]
  for (const d of detailsCandidates) {
    if (d.closest(notionToggleSelector()) == null) return d
  }
  // Notion toggle: header-block with aria-expanded inside
  const notionCandidates = Array.from(
    doc.querySelectorAll<HTMLElement>(notionToggleSelector()),
  )
  for (const n of notionCandidates) {
    if (!isInsideNotionToggle(n)) return n
  }
  return null
}

function notionToggleSelector(): string {
  return [
    ".notion-selectable.notion-header-block",
    ".notion-toggle",
  ].join(", ")
}

function isInsideNotionToggle(el: HTMLElement): boolean {
  let p = el.parentElement
  while (p) {
    if (p.matches(notionToggleSelector())) return true
    p = p.parentElement
  }
  return false
}

function flattenOne(doc: Document, root: HTMLElement, depthOffset: number): void {
  const { titleEl, level, expanded, bodyEls } = extractTitleAndBody(doc, root)
  const out: HTMLElement[] = []

  titleEl.setAttribute("data-rune-toggle-title", "1")
  titleEl.setAttribute("data-rune-toggle-level", String(level))
  titleEl.setAttribute("data-rune-toggle-expanded", expanded ? "true" : "false")
  if (depthOffset > 0) titleEl.setAttribute("data-rune-paste-depth", String(depthOffset))
  out.push(titleEl)

  for (const body of bodyEls) {
    // If body is itself a toggle, flatten it inline with depth+1.
    if (body.matches("details") || body.matches(notionToggleSelector())) {
      const stash = doc.createElement("div")
      doc.body.appendChild(stash)
      stash.appendChild(body)
      flattenOne(doc, body, depthOffset + 1)
      // After flattening, the title + children sit at top level under stash.
      Array.from(stash.children).forEach((c) => out.push(c as HTMLElement))
      stash.remove()
    } else {
      body.setAttribute("data-rune-paste-depth", String(depthOffset + 1))
      out.push(body)
    }
  }

  root.replaceWith(...out)
}

interface Extracted {
  titleEl: HTMLElement
  level: 0 | 2 | 3 | 4
  expanded: boolean
  bodyEls: HTMLElement[]
}

function extractTitleAndBody(doc: Document, root: HTMLElement): Extracted {
  // <details>: summary first child, others are body.
  if (root.tagName.toLowerCase() === "details") {
    const summary = root.querySelector(":scope > summary")
    const innerHead = summary?.querySelector("h1, h2, h3, h4, h5, h6")
    const titleEl =
      innerHead != null
        ? (doc.importNode(innerHead, true) as HTMLElement)
        : (() => {
            const p = doc.createElement("p")
            p.innerHTML = summary?.innerHTML ?? ""
            return p
          })()
    const level = headingLevelFromTag(titleEl.tagName)
    if (level === 0 && titleEl.tagName !== "P") {
      const p = doc.createElement("p")
      p.innerHTML = titleEl.innerHTML
      titleEl.replaceWith(p)
    }
    const expanded = (root as HTMLDetailsElement).open
    const bodyEls: HTMLElement[] = []
    for (const child of Array.from(root.children)) {
      if (child === summary) continue
      if (child instanceof HTMLElement) bodyEls.push(child)
    }
    return { titleEl, level, expanded, bodyEls }
  }
  // Notion variant.
  const head =
    root.querySelector("h1, h2, h3, h4, h5, h6") ?? root.querySelector("p, span")
  let titleEl: HTMLElement
  if (head && /^H[1-6]$/.test(head.tagName)) {
    titleEl = doc.importNode(head, true) as HTMLElement
  } else {
    titleEl = doc.createElement("p")
    titleEl.innerHTML = head?.innerHTML ?? ""
  }
  const level = headingLevelFromTag(titleEl.tagName)
  const expanded =
    root.querySelector("[aria-expanded='true']") != null ||
    root.getAttribute("aria-expanded") === "true"
  const bodyEls: HTMLElement[] = []
  // Heuristic: any element inside the toggle that contains block-level
  // children other than the title is the body container. We collect
  // direct block-level descendants of those containers.
  const bodyContainer =
    // First [id] descendant that isn't a DIRECT child of root. Written as an
    // explicit walk rather than `[id]:not(:scope > [id])` — `:scope` inside
    // `:not()` is rejected by some selector engines (e.g. nwsapi/jsdom).
    Array.from(root.querySelectorAll("[id]")).find((el) => el.parentElement !== root) ??
    Array.from(root.querySelectorAll("div")).reverse().find((d) => {
      return Array.from(d.children).some((c) => /^(P|UL|OL|H[1-6]|PRE|TABLE|DIV|DETAILS)$/.test(c.tagName))
    }) ?? null
  if (bodyContainer) {
    for (const child of Array.from(bodyContainer.children)) {
      if (child === head) continue
      if (child instanceof HTMLElement) bodyEls.push(child)
    }
  }
  return { titleEl, level, expanded, bodyEls }
}

function headingLevelFromTag(tag: string): 0 | 2 | 3 | 4 {
  // Toggle Heading caps at UI H3 (internal 4 → <h4>). Pasted H5/H6 from
  // other tools collapses to H4 here so a "Heading 5" toggle from an
  // external doc still lands as a toggle — just one level shallower.
  const m = /^H([1-6])$/.exec(tag.toUpperCase())
  if (!m) return 0
  const n = Number(m[1])
  if (n === 1) return 2
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}
