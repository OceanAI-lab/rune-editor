// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A switch row for native dropdown menus. Visual matches NativeMenuItem
// (gap, padding, hover bg) but the right edge holds a switch-styled
// <span> instead of an arrow/chevron. Click anywhere on the row toggles.
//
// Why a separate primitive:
//   * Native NativeMenuItem is a <button> that runs an action; switch
//     rows need a stable checked state and an `onCheckedChange`
//     callback, which doesn't fit the action-row contract.
//   * Caller would otherwise hand-roll the layout per call-site.
//
// onMouseDown semantics: same as NativeMenuItem — preventDefault to keep
// PM editor focus, since clicking a switch inside a dropdown that's
// opened over the editor would otherwise blur the cell selection.

import type { ComponentProps, ComponentType, ReactNode } from "react"
import { Switch } from "../components/ui/switch"
import type { IconProps } from "../icons"
import { cn } from "../lib/utils"
import { nativeMenuItemClass } from "./NativeMenu"

export interface NativeMenuSwitchItemProps
  extends Omit<ComponentProps<"div">, "onChange"> {
  icon?: ComponentType<IconProps>
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}

export function NativeMenuSwitchItem({
  icon: Icon,
  checked,
  onCheckedChange,
  className,
  children,
  onMouseDown,
  ...props
}: NativeMenuSwitchItemProps) {
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      className={cn(nativeMenuItemClass("default"), "justify-between cursor-pointer", className)}
      onMouseDown={(e) => {
        e.preventDefault()
        onMouseDown?.(e)
      }}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-5" /> : null}
        {typeof children === "string" ? <span>{children}</span> : children}
      </span>
      <Switch
        checked={checked}
        tabIndex={-1}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
