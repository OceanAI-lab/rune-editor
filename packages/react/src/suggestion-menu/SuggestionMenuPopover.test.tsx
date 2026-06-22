// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuggestionMenuPopover } from "./SuggestionMenuPopover";

describe("SuggestionMenuPopover", () => {
  it("renders null when closed", () => {
    const { container } = render(
      <SuggestionMenuPopover open={false} getClientRect={() => null}>
        <div>hi</div>
      </SuggestionMenuPopover>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders null when open but getClientRect is null", () => {
    const { container } = render(
      <SuggestionMenuPopover open={true} getClientRect={null}>
        <div>hi</div>
      </SuggestionMenuPopover>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders children when open and getClientRect is provided", () => {
    const rect = new DOMRect(10, 20, 0, 16);
    render(
      <SuggestionMenuPopover open={true} getClientRect={() => rect}>
        <div data-testid="content">hello</div>
      </SuggestionMenuPopover>,
    );
    expect(screen.getByTestId("content").textContent).toBe("hello");
    expect(
      screen.getByTestId("content").closest("[data-rune-editor-chrome]"),
    ).not.toBeNull();
  });
});

// Behavioral coverage for onEscapeKeyDown and onPointerDownOutside lives in
// the e2e suite — Radix's DismissableLayer attaches
// listeners on ownerDocument and uses capture-phase pointer events that
// jsdom doesn't propagate the same way as a real browser. The e2e specs
// "Escape closes the menu without inserting" and
// "outside-click closes the menu" are the regression fences.
