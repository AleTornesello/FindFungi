import { useState } from "react"
import { Flex, Image, type FlexProps } from "@chakra-ui/react"
import { MushroomIllustration } from "./MushroomIllustration"

/**
 * Cover photo filling its frame; photos are remote and won't load offline, so it falls back to the illustration.
 * Leave `alt` empty where the species name is already shown next to the photo.
 */
export function MushroomPhoto({
  src,
  alt = "",
  illustrationWidth = "24",
  ...frame
}: { src: string; alt?: string; illustrationWidth?: string } & FlexProps) {
  const [failed, setFailed] = useState(false)
  return (
    <Flex align="center" justify="center" bg="soil.50" overflow="hidden" {...frame}>
      {src && !failed ? (
        // The frame sets the size; width and height only give the browser an aspect ratio before the photo loads.
        <Image
          src={src}
          alt={alt}
          loading="lazy"
          htmlWidth="400"
          htmlHeight="300"
          w="full"
          h="full"
          objectFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <MushroomIllustration capColor="#B58962" stemColor="#E9D9C8" w={illustrationWidth} />
      )}
    </Flex>
  )
}
