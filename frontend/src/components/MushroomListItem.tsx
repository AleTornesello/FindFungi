import { Box, HStack, LinkBox, LinkOverlay, Text } from "@chakra-ui/react"
import { Link } from "react-router"
import { commonName, scientificName, speciesPath, type Mushroom } from "../data/mushrooms"
import { MushroomPhoto } from "./MushroomPhoto"
import { EdibilityBadge } from "./EdibilityBadge"
import { useI18n } from "../i18n/I18nProvider"

/** One-line counterpart of MushroomCard for the Explore list view. */
export function MushroomListItem({ mushroom }: { mushroom: Mushroom }) {
  const { taxonomy, properties } = mushroom
  const { locale } = useI18n()
  const subtitle = [commonName(mushroom, locale), taxonomy.family].filter(Boolean).join(" · ")

  return (
    <LinkBox
      as="article"
      bg="bg.panel"
      borderRadius="xl"
      borderWidth={properties.poisonous ? "2px" : "1px"}
      borderColor={properties.poisonous ? "amanita.solid" : "border"}
      overflow="hidden"
      transition="border-color 0.15s"
      _hover={{ borderColor: properties.poisonous ? "amanita.solid" : "soil.300" }}
    >
      <HStack gap="3" pe="3">
        <MushroomPhoto src={properties.images[0]?.url} w="16" minH="16" alignSelf="stretch" flexShrink={0} illustrationWidth="10" />
        <Box minW="0" flex="1">
          <Text fontFamily="heading" fontWeight="700" lineHeight="1.2" fontStyle="italic">
            <LinkOverlay asChild>
              <Link to={speciesPath(mushroom)}>{scientificName(mushroom)}</Link>
            </LinkOverlay>
          </Text>
          {subtitle && (
            <Text color="fg.muted" fontSize="sm" truncate>
              {subtitle}
            </Text>
          )}
        </Box>
        <EdibilityBadge properties={properties} px="2.5" flexShrink={0} />
      </HStack>
    </LinkBox>
  )
}
