import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1em]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 dark:hover:bg-primary/75",
        outline:
          "border-foreground/12 bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_9%)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-foreground/8 dark:bg-input/30 dark:hover:bg-input/65",
        secondary:
          "bg-[color-mix(in_oklch,var(--background),var(--foreground)_7%)] text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_12%)] aria-expanded:bg-muted aria-expanded:text-secondary-foreground dark:bg-input/50 dark:hover:bg-input/85",
        ghost:
          "hover:bg-input/80 hover:text-foreground aria-expanded:bg-input/80 aria-expanded:text-foreground dark:hover:bg-input/50 dark:aria-expanded:bg-input/50",
        destructive:
          "bg-[color-mix(in_oklch,var(--destructive-soft)_20%,transparent)] text-[color-mix(in_oklch,var(--destructive-soft)_66%,black)] hover:bg-[color-mix(in_oklch,var(--destructive-soft)_28%,transparent)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:text-[color-mix(in_oklch,var(--destructive-soft)_43%,white)] dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 text-[14px] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        sm: "h-9 gap-1 px-3 text-[14px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-1.5 px-5 text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xl: "h-12 gap-2 px-7 text-[16px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-4",
        "icon-xl": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
