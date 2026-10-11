import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Box, Button, Flex, HStack, IconButton, Image, Spinner, Text } from "@chakra-ui/react"
import { Camera, Images, X } from "lucide-react"
import { useI18n } from "../i18n/I18nProvider"

/** An object URL for the blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}

interface Props {
  photo: Blob | undefined
  /** Set while a picked photo is being prepared. */
  busy: boolean
  /** Set when the picked file couldn't be read as a photo. */
  failed: boolean
  onPick: (file: File) => void
  onRemove: () => void
}

/**
 * The first thing in the finds form: a large button that opens the phone's rear camera, so the
 * find is photographed where it grows. Picking from the gallery is offered too, but smaller.
 * On a computer, the camera button opens the file picker.
 */
export function FindPhotoInput({ photo, busy, failed, onPick, onRemove }: Props) {
  const { t } = useI18n()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(photo)

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // So the same photo can be picked again after removing it.
    if (file) onPick(file)
  }

  const takePhoto = () => camera.current?.click()

  return (
    <Box>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />

      {url ? (
        <Box position="relative" borderRadius="2xl" overflow="hidden" aspectRatio="4 / 3" bg="soil.50">
          <Image src={url} alt={t("finds.photo.preview")} w="full" h="full" objectFit="cover" />
          <HStack position="absolute" bottom="3" right="3" gap="2">
            <Button
              size="sm"
              borderRadius="full"
              bg="blackAlpha.700"
              color="white"
              _hover={{ bg: "blackAlpha.800" }}
              onClick={takePhoto}
            >
              <Camera aria-hidden />
              {t("finds.photo.retake")}
            </Button>
            <IconButton
              aria-label={t("finds.photo.remove")}
              size="sm"
              borderRadius="full"
              bg="blackAlpha.700"
              color="white"
              _hover={{ bg: "blackAlpha.800" }}
              onClick={onRemove}
            >
              <X />
            </IconButton>
          </HStack>
        </Box>
      ) : (
        <Flex
          asChild
          direction="column"
          align="center"
          justify="center"
          gap="2"
          w="full"
          aspectRatio={{ base: "4 / 3", lg: "16 / 9" }}
          px="4"
          borderRadius="2xl"
          borderWidth="2px"
          borderStyle="dashed"
          borderColor="moss.emphasized"
          bg="moss.subtle"
          cursor="pointer"
          transition="background 0.15s"
          _hover={{ bg: "moss.muted" }}
          _active={{ bg: "moss.muted" }}
          focusRing="outside"
        >
          <button type="button" onClick={takePhoto} disabled={busy}>
            <Flex as="span" p="4" borderRadius="full" bg="moss.solid" color="moss.contrast" boxShadow="md">
              {busy ? <Spinner size="lg" /> : <Camera size={36} aria-hidden />}
            </Flex>
            <Text as="span" fontWeight="800" fontSize="xl" color="moss.fg">
              <Box as="span" display={{ base: "inline", lg: "none" }}>
                {t("finds.photo.take")}
              </Box>
              <Box as="span" display={{ base: "none", lg: "inline" }}>
                {t("finds.photo.add")}
              </Box>
            </Text>
            <Text as="span" fontSize="sm" color="fg.muted" maxW="xs" textAlign="center">
              {t("finds.photo.hint")}
            </Text>
          </button>
        </Flex>
      )}

      {failed && (
        <Text fontSize="sm" color="fg.error" mt="2">
          {t("finds.photo.failed")}
        </Text>
      )}

      {!url && (
        // Only on phones: on a computer the button above already opens the file picker.
        <Flex justify="center" mt="1" display={{ base: "flex", lg: "none" }}>
          <Button variant="plain" size="sm" color="fg.muted" disabled={busy} onClick={() => gallery.current?.click()}>
            <Images aria-hidden />
            {t("finds.photo.gallery")}
          </Button>
        </Flex>
      )}
    </Box>
  )
}
