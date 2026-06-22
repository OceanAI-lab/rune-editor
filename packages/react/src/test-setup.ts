// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't ship ResizeObserver; frimousse and a few other libraries
// instantiate it unconditionally. Stub it for the test environment.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

window.scrollBy = () => {};

if (typeof document.elementFromPoint === "undefined") {
  document.elementFromPoint = () => document.body;
}

// RTL auto-cleanup isn't wired to vitest's lifecycle out of the box;
// register it so tests that portal into document.body (e.g. Radix
// Popover) don't leak nodes across tests.
afterEach(() => {
  cleanup();
});
