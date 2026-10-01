import { useState } from "react"
import { Flex, Image, type FlexProps } from "@chakra-ui/react"
import { MushroomIllustration } from "./MushroomIllustration"

/** Cover photo filling its frame; photos are remote and won't load offline, so it falls back to the illustration. */
export function MushroomPhoto({ src, illustrationWidth = "24", ...frame }: { src: string; illustrationWidth?: string } & FlexProps) {
  const [failed, setFailed] = useState(false)
  return (
    <Flex align="center" justify="center" bg="soil.50" overflow="hidden" {...frame}>
      {src && !failed ? (
        <Image src={src} alt="" loading="lazy" w="full" h="full" objectFit="cover" onError={() => setFailed(true)} />
      ) : (
        <MushroomIllustration capColor="#B58962" stemColor="#E9D9C8" w={illustrationWidth} />
      )}
    </Flex>
  )
}
