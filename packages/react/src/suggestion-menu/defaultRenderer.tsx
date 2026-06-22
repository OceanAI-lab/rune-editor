// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/react/src/suggestion-menu/defaultRenderer.tsx
import { useCallback, useId, useState } from "react";
import { useComponentsContext } from "./ComponentsContext";
import { groupSuggestionMenuItems, orderSuggestionMenuItems } from "./grouping";
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from "./types";

function useIsScrollable() {
  const [scrollable, setScrollable] = useState(false);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const check = () => setScrollable(node.scrollHeight > node.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return { ref, scrollable };
}

// Notion-style symmetric edge fade: the top AND bottom of the scroll
// viewport fade to transparent, so items approaching either edge read
// as "there's more" instead of clipped. 16px cues the cut without
// swallowing short group labels (e.g. "Recently used") flush at the top.
// Moved here from SuggestionMenuPopover so the side-menu Turn-into surface
// (which doesn't use that popover) gets the same fade for free.
const SCROLL_FADE_MASK =
  "linear-gradient(transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)";

export function DefaultSuggestionMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
  onItemHover,
  menuId,
  showEmptyState = true,
  revealSelectedItem = true,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const fallbackId = useId();
  const id = menuId ?? fallbackId;
  const { SuggestionMenu: S } = useComponentsContext();
  const { ref: scrollRef, scrollable } = useIsScrollable();

  const orderedItems = orderSuggestionMenuItems(items);
  const groups = groupSuggestionMenuItems(orderedItems);
  let flatIndex = 0;

  return (
    // Scroller owns the height cap + overflow + edge-fade mask. The outer
    // chrome (rounded corners, ring, shadow) is the popover/submenu's job —
    // putting the mask there would clip the chrome itself (see prior bug
    // note in SuggestionMenuPopover).
    <div
      ref={scrollRef}
      className="rune-muted-scrollbar max-h-[min(40vh,28rem)] overflow-y-auto p-1"
      style={scrollable ? { maskImage: SCROLL_FADE_MASK } : undefined}
    >
      <S.Root id={id}>
        {loadingState === "loading-initial" ? (
          <S.Loader />
        ) : orderedItems.length === 0 && loadingState === "loaded" && showEmptyState ? (
          <S.EmptyItem />
        ) : (
          groups.map((g, gi) => (
            <div key={g.label ?? gi}>
              {g.label ? <S.Label>{g.label}</S.Label> : null}
              {g.items.map((item) => {
                const itemIndex = flatIndex;
                flatIndex += 1;
                return (
                  <S.Item
                    key={itemIndex}
                    id={`${id}-item-${itemIndex}`}
                    isSelected={itemIndex === selectedIndex}
                    revealOnSelect={revealSelectedItem && itemIndex === selectedIndex}
                    onClick={() => onItemClick?.(item)}
                    onMouseEnter={
                      onItemHover ? () => onItemHover(itemIndex) : undefined
                    }
                    item={item}
                  />
                );
              })}
            </div>
          ))
        )}
        {loadingState === "loading" ? <S.Loader /> : null}
      </S.Root>
    </div>
  );
}
