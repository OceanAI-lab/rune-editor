// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { forwardRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export const SuggestionMenuLabel = forwardRef<
  HTMLDivElement,
  { className?: string; children?: ReactNode }
>(function SuggestionMenuLabel({ className, children }, ref) {
  return (
    <div
      ref={ref}
      className={cn("px-2 py-1 text-xs font-semibold text-muted-foreground", className)}
    >
      {children}
    </div>
  );
});
