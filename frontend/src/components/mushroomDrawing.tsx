import { chakra, type HTMLChakraProps } from "@chakra-ui/react"
import type { ReactNode } from "react"

/**
 * Shared look of the trait drawings (cap shapes, hymenium types, gill attachments, stipes,
 * flesh): a 64×64 section through the fruiting body, ground at y=58, filled shapes outlined in
 * the text colour, so each set reads as one family next to the others.
 */
export const FILL = {
  cap: "var(--chakra-colors-soil-400)",
  stipe: "var(--chakra-colors-soil-100)",
  /** Spore-bearing surface: gills, tubes, spines. */
  hymenium: "var(--chakra-colors-soil-200)",
  /** Fruiting bodies with no separate cap and stipe. */
  body: "var(--chakra-colors-chanterelle-300)",
  /** Spore mass inside a puffball or truffle. */
  gleba: "var(--chakra-colors-soil-600)",
  substrate: "var(--chakra-colors-soil-500)",
  /** Remains of the veil: ring, volva. */
  veil: "var(--chakra-colors-soil-50)",
  /** Inside of a fruiting body cut in half. */
  flesh: "var(--chakra-colors-soil-50)",
  /** Flesh turning colour where it's cut or bruised, as in many boletes. */
  stain: "var(--chakra-colors-blue-400)",
  stainDeep: "var(--chakra-colors-blue-600)",
}

export const OUTLINE = { stroke: "currentColor", strokeWidth: 1.5 } as const
/** Fine detail drawn inside a filled shape, like gill edges or tube walls. */
export const DETAIL = { stroke: "currentColor", strokeWidth: 1, opacity: 0.7 } as const

export const Ground = () => <path d="M10 58 H54" stroke="currentColor" strokeWidth="1.5" opacity={0.35} />

/** Stipe from just under the cap (`top`) down to the ground. */
export const Stipe = ({ top }: { top: number }) => (
  <path
    d={`M27.5 ${top - 1} L36.5 ${top - 1} L38 55 C38 57.5 36.5 58 35 58 L29 58 C27.5 58 26 57.5 26 55Z`}
    fill={FILL.stipe}
    {...OUTLINE}
  />
)

/** The same path reflected across the vertical centre line, for the other half of a section. */
export const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${64 - Number(x)} ${y}`)

export type DrawingProps = { title?: string } & Omit<HTMLChakraProps<"svg">, "children">

export function DrawingSvg({ title, children, ...rest }: DrawingProps & { children: ReactNode }) {
  return (
    <chakra.svg
      viewBox="0 0 64 64"
      w="10"
      h="10"
      flexShrink={0}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      strokeLinejoin="round"
      strokeLinecap="round"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </chakra.svg>
  )
}
