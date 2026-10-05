import { useRef, useState } from "react"
import { Box, Button, Link as ChakraLink, Checkbox, Dialog, Flex, Portal, Text } from "@chakra-ui/react"
import { Link, useLocation } from "react-router"
import { TriangleAlert } from "lucide-react"
import { useI18n } from "../i18n/I18nProvider"

// Replaces the old "findfungi:safetyNoticeDismissed", which only meant "don't show again", not acceptance.
const KEY = "findfungi:disclaimerAccepted"

function isAccepted() {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false // Storage blocked: show the notice on every visit rather than never.
  }
}

/**
 * Blocks the site until the user accepts the disclaimer, once per browser. It stays out of the way
 * on the disclaimer page itself so the full text can be read first.
 */
export function SafetyNoticeDialog() {
  const { t } = useI18n()
  const onDisclaimerPage = useLocation().pathname === "/disclaimer"
  const [accepted, setAccepted] = useState(isAccepted)
  const [checked, setChecked] = useState(false)
  const checkboxRef = useRef<HTMLInputElement>(null)

  const accept = () => {
    try {
      localStorage.setItem(KEY, "1")
    } catch {
      // Not persisted; the notice will come back next visit.
    }
    setAccepted(true)
  }

  return (
    <Dialog.Root
      role="alertdialog"
      open={!accepted && !onDisclaimerPage}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      initialFocusEl={() => checkboxRef.current}
      placement="center"
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="3xl" mx="4">
            <Dialog.Header>
              <Flex align="center" gap="3">
                <Box flexShrink={0} p="2" borderRadius="full" bg="amanita.solid" color="amanita.contrast">
                  <TriangleAlert size={22} aria-hidden />
                </Box>
                <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800" letterSpacing="-0.02em">
                  {t("safety.title")}
                </Dialog.Title>
              </Flex>
            </Dialog.Header>

            <Dialog.Body>
              <Dialog.Description asChild>
                <Box>
                  <Text>{t("safety.body")}</Text>
                  <Text mt="3" fontWeight="700">
                    {t("safety.expert")}
                  </Text>
                  <ChakraLink asChild display="inline-block" mt="3" fontSize="sm" color="moss.fg" textDecoration="underline">
                    <Link to="/disclaimer">
                      {t("safety.readMore")}
                    </Link>
                  </ChakraLink>
                </Box>
              </Dialog.Description>
            </Dialog.Body>

            <Dialog.Footer flexDirection={{ base: "column", sm: "row" }} alignItems={{ base: "stretch", sm: "center" }} justifyContent="space-between" gap="4">
              <Checkbox.Root checked={checked} onCheckedChange={(e) => setChecked(e.checked === true)}>
                <Checkbox.HiddenInput ref={checkboxRef} />
                <Checkbox.Control />
                <Checkbox.Label>{t("safety.accept")}</Checkbox.Label>
              </Checkbox.Root>
              <Button borderRadius="full" disabled={!checked} bg="soil.900" color="lichen.300" _hover={{ bg: "soil.800" }} onClick={accept}>
                {t("safety.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
