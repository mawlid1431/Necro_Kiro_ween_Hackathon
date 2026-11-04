import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Page-width wrapper: 16px gutters on phones, widening up to large monitors. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 3xl:max-w-[100rem]", className)}
      {...props}
    />
  );
}
