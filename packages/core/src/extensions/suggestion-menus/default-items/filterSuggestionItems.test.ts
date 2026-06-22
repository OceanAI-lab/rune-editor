// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { filterSuggestionItems } from "./filterSuggestionItems";

const items = [
  { title: "Heading 1", aliases: ["h1"] },
  { title: "Heading 2", aliases: ["h2"] },
  { title: "Paragraph", aliases: ["p", "text"] },
  { title: "Bullet List", aliases: ["ul", "unordered"] },
];

describe("filterSuggestionItems", () => {
  it("returns all items when query is empty", () => {
    expect(filterSuggestionItems(items, "")).toEqual(items);
  });

  it("matches by title substring (case-insensitive)", () => {
    expect(filterSuggestionItems(items, "head").map((i) => i.title))
      .toEqual(["Heading 1", "Heading 2"]);
  });

  it("matches by alias", () => {
    expect(filterSuggestionItems(items, "h1").map((i) => i.title)).toEqual(["Heading 1"]);
    expect(filterSuggestionItems(items, "ul").map((i) => i.title)).toEqual(["Bullet List"]);
  });

  it("ranks title-prefix above title-substring above alias-substring", () => {
    const mixed = [
      { title: "Other", aliases: ["heading"] },          // alias hit
      { title: "Big Heading", aliases: [] },             // title substring
      { title: "Heading Something", aliases: [] },        // title prefix
    ];
    const out = filterSuggestionItems(mixed, "heading").map((i) => i.title);
    expect(out).toEqual(["Heading Something", "Big Heading", "Other"]);
  });

  it("returns [] when nothing matches", () => {
    expect(filterSuggestionItems(items, "xyz")).toEqual([]);
  });

  it("fuzzy-matches single-typo titles via first-char anchor", () => {
    // "hej" misses every literal check (no substring, no alias) but the
    // same-length prefix of "Heading 1/2" is "hea" — edit distance 1,
    // within the budget for 3-char queries. Both headings should show.
    const out = filterSuggestionItems(items, "hej").map((i) => i.title);
    expect(out).toEqual(["Heading 1", "Heading 2"]);
  });

  it("does NOT fuzzy-match when the first char differs", () => {
    // "xej" shares no opening char with any title — the fuzzy tier is
    // first-char anchored to avoid pulling in unrelated items.
    expect(filterSuggestionItems(items, "xej")).toEqual([]);
  });

  it("does NOT fuzzy-match single-char queries", () => {
    // tolerance(1) === 0, so "z" stays a true miss instead of matching
    // every title that happens to start with z (here: none, which keeps
    // the existing behavior intact). "h" goes through the literal pass
    // (Heading 1/2 prefix, Paragraph substring via trailing 'h') and
    // never reaches the fuzzy fallback at all.
    expect(filterSuggestionItems(items, "z")).toEqual([]);
    expect(filterSuggestionItems(items, "h").map((i) => i.title))
      .toEqual(["Heading 1", "Heading 2", "Paragraph"]);
  });

  it("fuzzy-matches longer queries with the larger budget", () => {
    // "headig" (n dropped) → "headin" prefix, edit distance 1.
    expect(filterSuggestionItems(items, "headig").map((i) => i.title))
      .toEqual(["Heading 1", "Heading 2"]);
  });

  it("suppresses fuzzy results when any literal match exists", () => {
    // "head" literal-prefix-matches "Heading 1". "Heap" would otherwise
    // be a fuzzy hit (edit distance 1 against the same-length prefix).
    // The two-pass design suppresses the fuzzy fallback entirely
    // whenever any literal tier hits — so the user never sees noisy
    // approximations diluting a clear result set.
    const mixed = [
      { title: "Heap", aliases: [] },
      { title: "Heading 1", aliases: [] },
    ];
    expect(filterSuggestionItems(mixed, "head").map((i) => i.title))
      .toEqual(["Heading 1"]);
  });
});
