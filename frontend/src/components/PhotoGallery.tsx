import { useState, type ReactNode } from "react"
import { Box, Button, CloseButton, Dialog, Flex, HStack, IconButton, Image, Link, Portal, SimpleGrid, Text } from "@chakra-ui/react"
import { ChevronLeft, ChevronRight, ExternalLink, MapPin } from "lucide-react"
import type { MushroomImage } from "../data/mushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { MushroomPhoto } from "./MushroomPhoto"

/** Photos are full size, and a species can have dozens: load the rest only on request. */
const PREVIEW_COUNT = 9

const SOURCES: [host: string, name: string][] = [
  ["wikimedia.org", "Wikimedia Commons"],
  ["funghiitaliani.it", "funghiitaliani.it"],
]

function sourceName(url: string): string {
  const host = new URL(url).hostname
  return SOURCES.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? host
}

export function PhotoGallery({ images, name }: { images: MushroomImage[]; name: string }) {
  const { t } = useI18n()
  const [showAll, setShowAll] = useState(false)
  const [current, setCurrent] = useState<number | null>(null)
  const shown = showAll ? images : images.slice(0, PREVIEW_COUNT)

  return (
    <>
      <SimpleGrid columns={{ base: 2, sm: 3 }} gap="2" mt="4">
        {shown.map(({ url }, i) => (
          <Box
            key={url}
            as="button"
            onClick={() => setCurrent(i)}
            aria-label={t("detail.openPhoto", { index: i + 1, count: images.length })}
            borderRadius="xl"
            overflow="hidden"
            cursor="zoom-in"
            focusVisibleRing="outside"
            focusRingColor="moss.solid"
          >
            <MushroomPhoto src={url} aspectRatio="1" w="full" illustrationWidth="16" />
          </Box>
        ))}
      </SimpleGrid>

      {!showAll && images.length > PREVIEW_COUNT && (
        <Button mt="4" variant="outline" borderRadius="full" colorPalette="moss" onClick={() => setShowAll(true)}>
          {t("detail.showAllPhotos", { count: images.length })}
        </Button>
      )}

      <PhotoViewer images={images} name={name} index={current} onIndexChange={setCurrent} />
    </>
  )
}

function PhotoViewer({
  images,
  name,
  index,
  onIndexChange,
}: {
  images: MushroomImage[]
  name: string
  index: number | null
  onIndexChange: (index: number | null) => void
}) {
  const { t } = useI18n()
  const count = images.length
  const image = index === null ? undefined : images[index]
  const src = image?.url
  const go = (step: number) => index !== null && onIndexChange((index + step + count) % count)

  return (
    <Dialog.Root open={index !== null} onOpenChange={(e) => !e.open && onIndexChange(null)} size="full" motionPreset="none">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            // Solid, so the page behind doesn't compete with the photo.
            bg="soil.950"
            color="white"
            boxShadow="none"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") go(-1)
              if (e.key === "ArrowRight") go(1)
            }}
          >
            <Dialog.Title srOnly>{name}</Dialog.Title>
            <Flex direction="column" h="100dvh" px={{ base: "2", md: "6" }} py="3">
              <Flex justify="space-between" align="center" gap="4">
                <Text fontWeight="600" fontVariantNumeric="tabular-nums" aria-live="polite">
                  {index !== null && `${index + 1} / ${count}`}
                </Text>
                <Dialog.CloseTrigger asChild position="static">
                  <CloseButton variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }} aria-label={t("detail.closePhotos")} />
                </Dialog.CloseTrigger>
              </Flex>

              <Flex flex="1" minH="0" align="center" justify="center" gap={{ base: "1", md: "4" }}>
                {count > 1 && <StepButton label={t("detail.previousPhoto")} onClick={() => go(-1)} icon={<ChevronLeft />} />}
                <Flex flex="1" minW="0" h="full" align="center" justify="center">
                  {src && (
                    // Auto size keeps the photo's own dimensions; the attributes are only a placeholder ratio until it loads.
                    <Image
                      key={src}
                      src={src}
                      alt={name}
                      htmlWidth="1200"
                      htmlHeight="900"
                      w="auto"
                      h="auto"
                      maxW="full"
                      maxH="full"
                      objectFit="contain"
                      borderRadius="lg"
                    />
                  )}
                </Flex>
                {count > 1 && <StepButton label={t("detail.nextPhoto")} onClick={() => go(1)} icon={<ChevronRight />} />}
              </Flex>

              {src && (
                <HStack justify="center" pt="3" gap="3" flexWrap="wrap" color="whiteAlpha.800" fontSize="sm">
                  {image?.region && (
                    <Text display="inline-flex" alignItems="center" gap="1.5">
                      <MapPin size={14} aria-hidden />
                      {t("detail.photoRegion", { region: image.region })}
                    </Text>
                  )}
                  <Link href={src} target="_blank" rel="noopener noreferrer" color="whiteAlpha.800" fontSize="sm" display="inline-flex" gap="1.5">
                    {t("detail.photoSource", { source: sourceName(src) })}
                    <ExternalLink size={14} aria-hidden />
                  </Link>
                </HStack>
              )}
            </Flex>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function StepButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <IconButton
      aria-label={label}
      onClick={onClick}
      variant="ghost"
      color="white"
      borderRadius="full"
      size={{ base: "md", md: "lg" }}
      flexShrink={0}
      _hover={{ bg: "whiteAlpha.200" }}
    >
      {icon}
    </IconButton>
  )
}
