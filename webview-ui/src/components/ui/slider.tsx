"use client"

import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

function Slider({
  className,
  ...props
}: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        "data-horizontal:h-5",
        "data-vertical:h-full data-vertical:min-h-50 data-vertical:w-5 data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className={cn(
          "relative flex items-center",
          "data-horizontal:w-full data-horizontal:h-full",
          "data-vertical:h-full data-vertical:w-full data-vertical:flex-col"
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-clip rounded-full bg-[var(--vscode-input-border,var(--vscode-button-secondaryBackground))]",
            "data-horizontal:h-1.5 data-horizontal:w-full",
            "data-vertical:w-1.5 data-vertical:h-full"
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="absolute rounded-full bg-[var(--vscode-button-background)] data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className={cn(
            "block h-4 w-4 shrink-0 rounded-full border border-[var(--vscode-button-background)] bg-[var(--vscode-editor-background)] shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]",
            "disabled:pointer-events-none"
          )}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
