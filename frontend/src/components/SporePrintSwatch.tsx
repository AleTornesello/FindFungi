import { Box, type BoxProps } from "@chakra-ui/react"
import { splitValues } from "../data/advancedFilters"

/** Approximate colour of each spore print, as it looks deposited on paper. */
const SPORE_COLORS: Record<string, string> = {
  white: "#FFFFFF",
  cream: "#F3E6C4",
  buff: "#E2C48F",
  yellow: "#E8C640",
  ochre: "#C98A2E",
  tan: "#C49A6C",
  salmon: "#F0A58A",
  pink: "#E9A9A5",
  "pinkish-brown": "#B98272",
  brown: "#7B5034",
  "yellow-brown": "#9C7A33",
  "reddish-brown": "#8A3F2A",
  olive: "#7D7A3A",
  "olive-brown": "#6B5B2E",
  green: "#5E8A4A",
  purple: "#6E3F6E",
  "purple-brown": "#5A3446",
  "purple-black": "#2E1B2E",
  "blackish-brown": "#2F2219",
  black: "#141414",
}

/**
 * Small dot in the colour of a spore print. A range like "white to cream" shades from one
 * colour to the other; values with no known colour render nothing.
 */
export function SporePrintSwatch({ value, ...rest }: { value: string } & BoxProps) {
  const colors = splitValues(value)
    .map((v) => SPORE_COLORS[v])
    .filter(Boolean)
  if (colors.length === 0) return null
  return (
    <Box
      as="span"
      aria-hidden
      display="inline-block"
      flexShrink={0}
      w="3"
      h="3"
      borderRadius="full"
      background={colors.length > 1 ? `linear-gradient(135deg, ${colors.join(", ")})` : colors[0]}
      // Inner and outer ring keep white prints visible on light panels and black ones on dark.
      boxShadow="inset 0 0 0 1px rgba(0,0,0,.25), 0 0 0 1px rgba(255,255,255,.12)"
      {...rest}
    />
  )
}
