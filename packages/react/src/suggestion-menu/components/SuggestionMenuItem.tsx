// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { forwardRef, useEffect, useRef } from "react";
import { CheckIcon } from "../../icons";
import { cn } from "../../lib/utils";
import type { DefaultReactSuggestionItem } from "../types";

export const SuggestionMenuItem = forwardRef<
  HTMLDivElement,
  {
    id: string;
    isSelected: boolean;
    onClick: () => void;
    // Notify caller when the pointer enters this row, so the parent menu
    // can move `selectedIndex` to here — keeping mouse hover and keyboard
    // selection in a single source of truth. Without this the keyboard
    // highlight and the hovered row can desync (e.g. arrow-down to row 3
    // then mouse over row 5 → row 3 still painted, row 5 looks dead).
    onMouseEnter?: () => void;
    revealOnSelect?: boolean;
    item: Omit<DefaultReactSuggestionItem, "onItemClick">;
    className?: string;
  }
>(function SuggestionMenuItem({
  id,
  isSelected,
  onClick,
  onMouseEnter,
  revealOnSelect = true,
  item,
  className,
}, ref) {
  // Keep the keyboard-selected row in view. The popover's inner scroller
  // (overflow-y-auto + max-h) clips items past the visible window, and
  // arrow-down/up only moves selection — without scrollIntoView the
  // selection silently walks off-screen.
  //
  // `block: "nearest"` only scrolls when the row is actually outside the
  // viewport, so it's a no-op when the row is already visible — no jitter
  // on every arrow press. We forward the external ref AND keep a local
  // ref so the user can still grab the DOM via the forwarded ref.
  const localRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isSelected || !revealOnSelect) return;
    // jsdom doesn't implement scrollIntoView — guard so unit tests pass.
    localRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [isSelected, revealOnSelect]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      id={id}
      role="option"
      aria-selected={isSelected || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "rune-suggestion-item flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
        isSelected && "bg-accent text-accent-foreground",
        item.size === "small" && "py-1 text-xs",
        className,
      )}
    >
      {item.icon ? <div className="shrink-0">{item.icon}</div> : null}
      <div className="flex min-w-0 flex-col">
        {item.subLabel ? (
          // Filtered-result row (Notion layout): title and sub-label on
          // ONE line separated by a muted middle dot. The whole strip
          // truncates as a unit so long titles eat into the sub-label
          // rather than pushing it onto a second line.
          <div className="flex min-w-0 items-center gap-1.5 truncate font-medium">
            <span className="truncate">{item.title}</span>
            <span aria-hidden className="text-muted-foreground">·</span>
            <span className="truncate font-normal text-muted-foreground">
              {item.subLabel}
            </span>
          </div>
        ) : (
          <div className="truncate">{item.title}</div>
        )}
        {item.subtext ? (
          <div className="truncate text-xs text-muted-foreground">{item.subtext}</div>
        ) : null}
      </div>
      {item.active ? (
        // `active` takes precedence over badge/shortcut so both the
        // Turn-into menu and the slash menu's filtered "Turn into"
        // duplicates cleanly mark the source block's current type with
        // a check in the right slot (Notion pattern).
        <CheckIcon className="ml-auto size-4 text-muted-foreground" />
      ) : item.badge ? (
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {item.badge}
        </span>
      ) : item.shortcut ? (
        <span className="ml-auto font-mono text-xs text-muted-foreground/60">
          {item.shortcut}
        </span>
      ) : null}
    </div>
  );
});
