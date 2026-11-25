import Image from "next/image";
import { cn } from "@/lib/utils";

const variants = {
  horizontal: { light: "/brand/logo-horizontal-light.svg", dark: "/brand/logo-horizontal-dark.svg", width: 375, height: 100 },
  symbol: { light: "/brand/symbol-light.svg", dark: "/brand/symbol-dark.svg", width: 80, height: 100 },
} as const;

type LogoProps = {
  variant?: keyof typeof variants;
  className?: string;
  priority?: boolean;
};

/** Brand logo files are used as-is: never recoloured, stretched or shadowed. The dark theme uses the dark files. */
export function Logo({ variant = "horizontal", className, priority }: LogoProps) {
  const { light, dark, width, height } = variants[variant];
  return (
    <>
      <Image src={light} width={width} height={height} alt="Necro" priority={priority} className={cn("h-auto dark:hidden", className)} />
      <Image src={dark} width={width} height={height} alt="Necro" priority={priority} className={cn("hidden h-auto dark:block", className)} />
    </>
  );
}
