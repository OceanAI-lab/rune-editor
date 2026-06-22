// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest";
import { groupSuggestionMenuItems } from "./grouping";

describe("groupSuggestionMenuItems", () => {
  it("uses the canonical suggestion-menu group order before first-seen custom groups", () => {
    const groups = groupSuggestionMenuItems([
      { title: "Image", group: "Media" },
      { title: "Custom", group: "Custom" },
      { title: "Paragraph", group: "Basic blocks" },
      { title: "Recent table", group: "Recently used" },
      { title: "Filtered heading", group: "Filter results" },
      { title: "Ungrouped" },
    ]);

    expect(groups.map((g) => g.label)).toEqual([
      "Recently used",
      "Filter results",
      "Basic blocks",
      "Media",
      "Custom",
      undefined,
    ]);
  });
});
