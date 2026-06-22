// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { forwardRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export const SuggestionMenu = forwardRef<
  HTMLDivElement,
  { id: string; className?: string; children?: ReactNode }
>(function SuggestionMenu({ id, className, children }, ref) {
  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      className={cn("rune-suggestion-menu flex min-w-56 flex-col gap-0.5", className)}
    >
      {children}
    </div>
  );
});
