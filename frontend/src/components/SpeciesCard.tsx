import { Badge, Box, Flex, HStack, Text } from "@chakra-ui/react"
import { EDIBILITY, MONTHS, type Species } from "../data/species"
import { MushroomIllustration } from "./MushroomIllustration"

export function SpeciesCard({ species }: { species: Species }) {
  const edibility = EDIBILITY[species.edibility]

  return (
    <Box
      as="article"
      bg="bg.panel"
      borderRadius="2xl"
      borderWidth="1px"
      borderColor="border"
      overflow="hidden"
      h="full"
    >
      <Flex
        align="flex-end"
        justify="center"
        h="32"
        pt="4"
        bg={`color-mix(in srgb, ${species.capColor} 18%, transparent)`}
      >
        <MushroomIllustration
          capColor={species.capColor}
          stemColor={species.stemColor}
          spots={species.spots}
          w="28"
          mb="-2"
        />
      </Flex>
      <Box p="4">
        <HStack justify="space-between" align="flex-start" gap="2">
          <Box>
            <Text fontFamily="heading" fontWeight="700" fontSize="lg" lineHeight="1.2">
              {species.commonName}
            </Text>
            <Text fontStyle="italic" color="fg.muted" fontSize="sm">
              {species.latinName}
            </Text>
          </Box>
          <Badge colorPalette={edibility.palette} variant="subtle" borderRadius="full" px="2.5" flexShrink={0}>
            {edibility.label}
          </Badge>
        </HStack>
        <Text mt="3" fontSize="sm" color="fg.muted">
          {species.habitat}
        </Text>
        <SeasonStrip months={species.months} />
      </Box>
    </Box>
  )
}

function SeasonStrip({ months }: { months: number[] }) {
  const label = `Fruits in ${months.map((m) => MONTHS[m - 1]).join(", ")}`
  return (
    <Box mt="4" aria-label={label} role="img">
      <Flex gap="0.5">
        {MONTHS.map((m, i) => (
          <Box
            key={m}
            flex="1"
            h="1.5"
            borderRadius="full"
            bg={months.includes(i + 1) ? "moss.500" : "border"}
          />
        ))}
      </Flex>
      <Flex justify="space-between" mt="1" fontSize="2xs" color="fg.muted">
        <span>Jan</span>
        <span>Jun</span>
        <span>Dec</span>
      </Flex>
    </Box>
  )
}
