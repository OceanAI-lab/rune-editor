// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest";
import { withRecentlyUsedGroup } from "./recent";

describe("withRecentlyUsedGroup", () => {
  it("adds recents at the head and removes their originals from the rest", () => {
    const items = [
      { key: "alpha", title: "Alpha", group: "Basic blocks" },
      { key: "beta", title: "Beta", group: "Basic blocks" },
    ];

    const out = withRecentlyUsedGroup(
      items,
      { alpha: { count: 1, lastUsedAt: 1000 } },
      5,
    );

    expect(out.map((item) => item.title)).toEqual(["Alpha", "Beta"]);
    expect(out[0]!.group).toBe("Recently used");
    expect(out.filter((item) => item.key === "alpha")).toHaveLength(1);
  });
});
