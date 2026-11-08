import Image from "next/image";
import { cn } from "@/lib/utils";

const variants = {
  horizontal: { src: "/brand/logo-horizontal-light.svg", width: 375, height: 100 },
  symbol: { src: "/brand/symbol-light.svg", width: 80, height: 100 },
} as const;

type LogoProps = {
  variant?: keyof typeof variants;
  className?: string;
  priority?: boolean;
};

/** Brand logo files are used as-is: never recoloured, stretched or shadowed. */
export function Logo({ variant = "horizontal", className, priority }: LogoProps) {
  const { src, width, height } = variants[variant];
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt="Necro"
      priority={priority}
      className={cn("h-auto", className)}
    />
  );
}
