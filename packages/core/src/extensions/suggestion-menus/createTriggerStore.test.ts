// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/extensions/suggestion-menus/createTriggerStore.test.ts
import { describe, it, expect, vi } from "vitest";
import { createTriggerStore } from "./createTriggerStore";

const CLOSED = { show: false, query: "", range: null, getClientRect: null };

describe("createTriggerStore", () => {
  it("starts closed", () => {
    const s = createTriggerStore();
    expect(s.getSnapshot()).toEqual(CLOSED);
    expect(s.keyHandler.current).toBeNull();
  });

  it("notifies subscribers when _setState changes identity", () => {
    const s = createTriggerStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s._setState({ show: true, query: "h", range: { from: 1, to: 2 }, getClientRect: () => null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot().show).toBe(true);
  });

  it("returns an unsubscribe function that detaches the listener", () => {
    const s = createTriggerStore();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    off();
    s._setState({ show: true, query: "x", range: null, getClientRect: null });
    expect(listener).not.toHaveBeenCalled();
  });
});
