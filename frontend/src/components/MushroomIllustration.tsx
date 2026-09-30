import { chakra, type HTMLChakraProps } from "@chakra-ui/react"

interface Props extends HTMLChakraProps<"svg"> {
  capColor: string
  stemColor: string
  spots?: boolean
}

/** A simple, recolorable mushroom used in place of photos. */
export function MushroomIllustration({ capColor, stemColor, spots, ...rest }: Props) {
  return (
    <chakra.svg viewBox="0 0 120 100" aria-hidden="true" {...rest}>
      <path d="M50 52h20l-3 38c0 4-3 6-7 6s-7-2-7-6z" fill={stemColor} />
      <path d="M50 58h20" stroke="rgba(0,0,0,.12)" strokeWidth="3" />
      <path d="M10 56C10 28 32 8 60 8s50 20 50 48c0 3-3 5-6 5H16c-3 0-6-2-6-5z" fill={capColor} />
      <path d="M22 26c8-10 20-15 32-15" stroke="rgba(255,255,255,.35)" strokeWidth="5" strokeLinecap="round" fill="none" />
      {spots && (
        <g fill="rgba(255,255,255,.85)">
          <ellipse cx="38" cy="30" rx="6" ry="4" />
          <ellipse cx="66" cy="22" rx="5" ry="3.5" />
          <ellipse cx="86" cy="38" rx="6" ry="4" />
          <ellipse cx="56" cy="44" rx="4" ry="3" />
          <ellipse cx="24" cy="46" rx="3.5" ry="2.5" />
        </g>
      )}
    </chakra.svg>
  )
}
