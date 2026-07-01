// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { JSONContent } from "@tiptap/core"
import { DOMParser as PMDOMParser, type Schema } from "@tiptap/pm/model"
import { markdownToHtml } from "./markdownToHtml"
import { collectKnownBlockTags } from "./knownBlockTags"
import { transformPastedHTMLDoc } from "./transformPastedHTML"

/** Parses an HTML string into a `Document`. Defaults to the browser global. */
export type ParseHTML = (html: string) => Document

const browserParseHTML: ParseHTML = (html) =>
  new DOMParser().parseFromString(html, "text/html")

/**
 * markdown-it renders a standalone image as `<p><img></p>` (an image is
 * inline in Markdown). rune's `image` is a BLOCK node, so PM's full-doc
 * `parse` closes the wrapping `<p>` and emits the image — leaving the now
 * emptied `<p>` as a stray blank block ABOVE every image. (The paste path
 * dodges this because `parseSlice` leaves that paragraph open and
 * `replaceSelection` merges it away; full-doc `parse` has no such merge.)
 * Unwrap each lone-image paragraph to the bare `<img>` so the image lands
 * as a clean top-level block. Mixed `text ![x](y) text` paragraphs are
 * left untouched (`children.length !== 1` / non-empty text guard).
 */
function unwrapLoneImageParagraphs(doc: Document) {
  for (const p of Array.from(doc.body.querySelectorAll("p"))) {
    const img = p.children.length === 1 ? p.firstElementChild : null
    if (!img || img.tagName !== "IMG") continue
    if (p.textContent?.replace(/\s/g, "") !== "") continue
    p.replaceWith(img)
  }
}

/**
 * Converts a Markdown document into a complete rune doc as ProseMirror
 * JSON — the editor-less import primitive (e.g. an app-level "Import
 * Markdown" button that creates a NEW page from an Obsidian `.md` file).
 *
 * Unlike the paste path (`handlePaste`), this needs NO live editor: it
 * reuses `markdownToHtml` → the schema-only `transformPastedHTMLDoc` →
 * PM's DOMParser, so a whole Obsidian vault can be converted in a loop
 * without mounting an editor per file. Pass `editor.schema` (or a schema
 * built from the same extensions the new page will mount with) so the
 * parse targets the right node set.
 *
 * It is editor-less, NOT DOM-less: the HTML→DOM→PM step needs a DOM
 * implementation. In the browser that is automatic (the default
 * `parseHTML` uses the global `DOMParser`). In a Node / worker migration
 * script, pass a `parseHTML` backed by a headless DOM (e.g. linkedom's
 * `new DOMParser().parseFromString(html, "text/html")`); the transform
 * uses only tag/nodeType checks, so any standards-compliant Document works
 * — no global-DOM shim required. (`markdownToHtml` itself is pure string →
 * string and needs nothing.)
 *
 * Image handling is intentionally skipped: there is no editor to route an
 * upload through, so `![alt](path)` lands as an image block carrying its
 * ORIGINAL `src` (local/relative paths included). Rewriting those URLs is
 * a downstream migration concern (e.g. an Obsidian vault's `./attachments/…`
 * relative paths must be re-hosted by the importing app).
 *
 * The result is a `{ type: "doc", content: [...] }` object. For a NEW page,
 * feed it whole to `useEditor({ content })` / `editor.commands.setContent(...)`.
 * To import into an EXISTING page, take `.content` (the block array) and feed
 * it to `editor.commands.insertContentAt(pos, content)` — e.g. append at the
 * current page's end with `pos = editor.state.doc.content.size`. Do NOT route
 * it through `editor.commands.insertBlocks`: that command takes
 * `RuneBlockInput[]` (the structured authoring shape), not the PM JSON this
 * returns.
 */
export function markdownToDoc(
  markdown: string,
  schema: Schema,
  parseHTML: ParseHTML = browserParseHTML,
): JSONContent {
  const dom = parseHTML(markdownToHtml(markdown))
  transformPastedHTMLDoc(dom, collectKnownBlockTags(schema))
  unwrapLoneImageParagraphs(dom)
  const doc = PMDOMParser.fromSchema(schema).parse(dom.body, { preserveWhitespace: true })
  return doc.toJSON() as JSONContent
}
