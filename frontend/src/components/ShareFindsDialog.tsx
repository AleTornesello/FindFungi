import { Box, Button, Dialog, Flex, Portal, Text } from "@chakra-ui/react"
import { Globe } from "lucide-react"
import { useI18n } from "../i18n/I18nProvider"

interface Props {
  open: boolean
  /** The user's choice, to remember for later finds. */
  onAnswer: (share: boolean) => void
  /** Closed without choosing: the find stays private and the question comes back next time. */
  onDismiss: () => void
}

/** Asks, once, whether finds may be shared anonymously, before the browser asks for the location. */
export function ShareFindsDialog({ open, onAnswer, onDismiss }: Props) {
  const { t } = useI18n()
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onDismiss()} placement="center" size="md">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="3xl" mx="4">
            <Dialog.Header>
              <Flex align="center" gap="3">
                <Box flexShrink={0} p="2" borderRadius="full" bg="moss.solid" color="moss.contrast">
                  <Globe size={22} aria-hidden />
                </Box>
                <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800" letterSpacing="-0.02em">
                  {t("finds.share.title")}
                </Dialog.Title>
              </Flex>
            </Dialog.Header>

            <Dialog.Body>
              <Dialog.Description asChild>
                <Box>
                  <Text>{t("finds.share.body")}</Text>
                  <Text mt="3" color="fg.muted" fontSize="sm">
                    {t("finds.share.location")}
                  </Text>
                </Box>
              </Dialog.Description>
            </Dialog.Body>

            <Dialog.Footer flexDirection={{ base: "column-reverse", sm: "row" }} alignItems="stretch" gap="3">
              <Button borderRadius="full" variant="outline" onClick={() => onAnswer(false)}>
                {t("finds.share.no")}
              </Button>
              <Button borderRadius="full" colorPalette="moss" fontWeight="700" onClick={() => onAnswer(true)}>
                {t("finds.share.yes")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
