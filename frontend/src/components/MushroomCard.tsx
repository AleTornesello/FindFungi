import { useState } from "react"
import { Badge, Box, Flex, HStack, Image, Text } from "@chakra-ui/react"
import { scientificName, type Mushroom } from "../data/mushrooms"
import { MushroomIllustration } from "./MushroomIllustration"

const FEATURES: { key: keyof Mushroom["properties"]; label: string }[] = [
  { key: "cap", label: "Cap" },
  { key: "hymenium", label: "Hymenium" },
  { key: "stipe", label: "Stipe" },
  { key: "sporePrint", label: "Spore print" },
  { key: "ecology", label: "Ecology" },
]

export function MushroomCard({ mushroom }: { mushroom: Mushroom }) {
  const { taxonomy, properties } = mushroom
  // Photos are remote and won't load offline; fall back to the illustration.
  const [imageFailed, setImageFailed] = useState(false)
  const features = FEATURES.filter((f) => {
    const v = properties[f.key]
    return typeof v === "string" && v && v !== "not applicable"
  })

  return (
    <Box as="article" bg="bg.panel" borderRadius="2xl" borderWidth="1px" borderColor="border" overflow="hidden" h="full">
      <Flex h="36" align="center" justify="center" bg="soil.50" overflow="hidden">
        {properties.coverImage && !imageFailed ? (
          <Image
            src={properties.coverImage}
            alt=""
            loading="lazy"
            w="full"
            h="full"
            objectFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MushroomIllustration capColor="#B58962" stemColor="#E9D9C8" w="24" />
        )}
      </Flex>
      <Box p="4">
        <HStack justify="space-between" align="flex-start" gap="2">
          <Box minW="0">
            <Text fontFamily="heading" fontWeight="700" fontSize="lg" lineHeight="1.2" fontStyle="italic">
              {scientificName(mushroom)}
            </Text>
            {taxonomy.family && (
              <Text color="fg.muted" fontSize="sm">
                {taxonomy.family}
              </Text>
            )}
          </Box>
          <Badge
            colorPalette={properties.edible ? "moss" : "soil"}
            variant="subtle"
            borderRadius="full"
            px="2.5"
            flexShrink={0}
          >
            {properties.edible ? "Edible" : "Not edible"}
          </Badge>
        </HStack>
        {features.length > 0 && (
          <Box as="dl" mt="3" fontSize="sm" display="grid" gridTemplateColumns="auto 1fr" columnGap="3" rowGap="0.5">
            {features.map((f) => (
              <Box key={f.key} display="contents">
                <Text as="dt" color="fg.muted">
                  {f.label}
                </Text>
                <Text as="dd">{properties[f.key] as string}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
