// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Shared visual primitives for our native (non-Radix) dropdown menus —
// BlockActionsDropdown, TableActionsDropdown, and the upcoming code-bar
// menu. Only styling and DOM shape live here; lifecycle (open/close,
// outside-click, Esc, anchoring) stays in each caller because the owners
// (PM plugin states, anchor rects, action semantics) differ enough that
// a shared hook would just be a configuration funnel.
//
// What lives here:
//   * nativeMenuContentClass / <NativeMenuContent>: floating panel chrome
//     — radius / shadow / ring / bg / animation. NativeMenuContent remains
//     for hand-positioned callers; Popover-based callers reuse the class
//     helper so Radix can own collision-aware placement.
//   * <NativeMenuItem>: a row button — gap, padding, svg sizing, default
//     and destructive variants matching shadcn DropdownMenuItem.
//   * nativeMenuItemClass: same row classes as a string, for callers
//     that need a non-button row (e.g. BlockActions' Color subtrigger
//     is a div with a hover-driven submenu, not a button).

import { forwardRef } from "react"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import type { IconProps } from "../icons"
import { cn } from "../lib/utils"
import { runeChromeClass } from "../lib/runeChromeClass"

export type NativeMenuItemVariant = "default" | "destructive"

// Shared row classes. Padding rhythm `px-1.5 py-1.5`, gap-1.5, rounded-md
// — matches our polish pass against shadcn's DropdownMenuItem. SVG is
// auto-sized to 4 (16px) unless the icon already declares a size-* class.
//
// Destructive variant: neutral at rest, accent bg on hover/focus (same
// as default), but label + icon flip to red. Subtler than shadcn's
// `variant="destructive"` (which paints red at rest); ports v1's
// destructiveItemClass — see `src/lib/constants.ts` on the v1 branch.
export function nativeMenuItemClass(
  variant: NativeMenuItemVariant = "default",
): string {
  return cn(
    "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1.5 text-start outline-hidden select-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
    variant === "destructive" &&
      "hover:text-destructive focus-visible:text-destructive hover:[&_svg]:text-destructive focus-visible:[&_svg]:text-destructive",
  )
}

export function nativeMenuContentClass(
  mode: "native" | "popover" = "native",
): string {
  // Same chrome source as PopoverContent (runeChromeClass); this surface adds
  // only its own layout (z/width/padding/text). `mode` picks the animation
  // variant: "popover" plays an exit animation (controlled mount), "native"
  // animates in only (hard-unmounts on close). Visually identical to the prior
  // inline string.
  return cn(
    runeChromeClass({ animation: mode === "popover" ? "popover" : "native" }),
    "z-50 w-3xs p-1 text-sm",
  )
}

// 1px horizontal rule between menu sections. Negative-margins so the line
// runs flush with the popover edges (NativeMenuContent has `p-1`).
export function NativeMenuSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

// Non-interactive section header. Shared with ColorMenu's per-grid caps
// ("Text color" / "Background color") so the visual rhythm of section
// labels is consistent across every dropdown surface — same font size,
// weight, and muted color. Callers override horizontal padding (px-1.5
// here aligns with NativeMenuItem; ColorMenu overrides to px-2 to align
// with its swatch grid). `select-none` + `pointer-events-none` keep the
// label out of caret / hover arbitration.
export function NativeMenuLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground select-none pointer-events-none",
        className,
      )}
      {...props}
    />
  )
}

export const NativeMenuContent = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function NativeMenuContent({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-rune-editor-chrome=""
        className={cn(nativeMenuContentClass(), className)}
        {...props}
      />
    )
  },
)

export interface NativeMenuItemProps
  extends Omit<ComponentProps<"button">, "type"> {
  icon?: ComponentType<IconProps>
  variant?: NativeMenuItemVariant
  children: ReactNode
}

export const NativeMenuItem = forwardRef<HTMLButtonElement, NativeMenuItemProps>(
  function NativeMenuItem(
    { icon: Icon, variant = "default", className, children, onMouseDown, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        role="menuitem"
        data-variant={variant}
        className={cn(nativeMenuItemClass(variant), className)}
        onMouseDown={(e) => {
          // Default: keep PM editor focus from being stolen — same trick
          // every native-menu caller used. Callers can opt out by passing
          // their own onMouseDown (we still call it after preventDefault
          // so they can extend, not replace, the focus guard).
          e.preventDefault()
          onMouseDown?.(e)
        }}
        {...props}
      >
        {Icon ? <Icon /> : null}
        {typeof children === "string" ? <span>{children}</span> : children}
      </button>
    )
  },
)
