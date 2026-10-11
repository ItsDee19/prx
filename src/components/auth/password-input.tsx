"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PasswordInputProps = Omit<InputProps, "type">;

/**
 * Password field with a show/hide toggle. The toggle is a real button so it is
 * reachable by keyboard; `aria-pressed` reflects the visibility state.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0 top-0 text-fg-subtle"
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
    );
  },
);
