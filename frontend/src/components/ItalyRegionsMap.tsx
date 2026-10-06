import { chakra } from "@chakra-ui/react"
import { ITALY_REGIONS, ITALY_VIEWBOX } from "../data/italyRegions"

const Svg = chakra("svg")
const Path = chakra("path")

/** Map of the Italian regions, the `highlighted` ones in yellow. */
export function ItalyRegionsMap({ highlighted, label }: { highlighted: Set<string>; label: string }) {
  return (
    <Svg viewBox={ITALY_VIEWBOX} role="img" aria-label={label} w="full" h="auto" display="block">
      {ITALY_REGIONS.map(({ name, path }) => (
        <Path
          key={name}
          d={path}
          fill={highlighted.has(name) ? "chanterelle.300" : "white"}
          stroke="soil.400"
          strokeWidth="0.9"
          strokeLinejoin="round"
        >
          <title>{name}</title>
        </Path>
      ))}
    </Svg>
  )
}
