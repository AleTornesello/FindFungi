import { Box, Button, Container, Flex, HStack, Image, Menu, Portal, Text } from "@chakra-ui/react"
import { Link, NavLink, Outlet } from "react-router"
import { BookOpen, Check, Languages, NotebookPen, type LucideIcon } from "lucide-react"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"
import { isLocale, LOCALES } from "../i18n/locales"

const NAV: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: "/", label: "nav.species", icon: BookOpen },
  { to: "/finds", label: "nav.finds", icon: NotebookPen },
]

export function Layout() {
  const { t } = useI18n()
  return (
    <Flex direction="column" minH="100dvh">
      <Box as="header" bg="soil.900" color="soil.50" position="sticky" top="0" zIndex="sticky">
        <Container maxW="6xl" px={{ base: "4", md: "6" }}>
          <Flex h="14" align="center" justify="space-between">
            <Logo />
            <HStack gap="2">
              <HStack as="nav" aria-label={t("nav.main")} gap="1" display={{ base: "none", md: "flex" }}>
                {NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                    {({ isActive }) => (
                      <Box
                        px="4"
                        py="2"
                        borderRadius="full"
                        fontWeight="600"
                        fontSize="sm"
                        bg={isActive ? "lichen.400" : "transparent"}
                        color={isActive ? "soil.900" : "soil.100"}
                        _hover={{ bg: isActive ? "lichen.400" : "soil.800" }}
                        transition="background 0.15s"
                      >
                        {t(item.label)}
                      </Box>
                    )}
                  </NavLink>
                ))}
              </HStack>
              <LanguageMenu />
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Box as="main" flex="1" pb={{ base: "24", md: "12" }}>
        <Outlet />
      </Box>

      <Box as="footer" display={{ base: "none", md: "block" }} borderTopWidth="1px" borderColor="border" py="6">
        <Container maxW="6xl" px="6">
          <Text fontSize="sm" color="fg.muted">
            {t("app.disclaimer")}
          </Text>
        </Container>
      </Box>

      <BottomNav />
    </Flex>
  )
}

function Logo() {
  const { t } = useI18n()
  return (
    <Link to="/" aria-label={t("app.home")}>
      <HStack gap="2">
        <Image src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" w="7" h="7" />
        <Text fontFamily="heading" fontWeight="800" fontSize="xl" letterSpacing="-0.02em">
          find<Box as="span" color="chanterelle.400">fungi</Box>
        </Text>
      </HStack>
    </Link>
  )
}

/** Thumb-reachable tab bar for phones; hidden from md up where the header nav takes over. */
function BottomNav() {
  const { t } = useI18n()
  return (
    <Box
      as="nav"
      aria-label={t("nav.main")}
      display={{ base: "block", md: "none" }}
      position="fixed"
      bottom="0"
      insetX="0"
      zIndex="sticky"
      px="3"
      pb="calc(env(safe-area-inset-bottom) + 12px)"
    >
      <Flex bg="soil.900" borderRadius="2xl" p="1.5" gap="1" boxShadow="0 8px 24px rgba(46,31,20,.35)">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} style={{ flex: 1 }}>
            {({ isActive }) => (
              <Flex
                direction="column"
                align="center"
                gap="0.5"
                py="2"
                borderRadius="xl"
                bg={isActive ? "lichen.400" : "transparent"}
                color={isActive ? "soil.900" : "soil.200"}
                fontSize="xs"
                fontWeight="600"
                transition="background 0.15s"
              >
                <Icon size={20} aria-hidden />
                {t(label)}
              </Flex>
            )}
          </NavLink>
        ))}
      </Flex>
    </Box>
  )
}

function LanguageMenu() {
  const { locale, setLocale, t } = useI18n()
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          borderRadius="full"
          color="soil.100"
          _hover={{ bg: "soil.800" }}
          _expanded={{ bg: "soil.800" }}
          aria-label={`${t("language.label")}: ${LOCALES[locale].name}`}
        >
          <Languages aria-hidden />
          <Text as="span" textTransform="uppercase" fontSize="xs" fontWeight="700">
            {locale}
          </Text>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="40">
            <Menu.RadioItemGroup
              value={locale}
              onValueChange={(e) => {
                if (isLocale(e.value)) setLocale(e.value)
              }}
            >
              {Object.entries(LOCALES).map(([code, { name }]) => (
                <Menu.RadioItem key={code} value={code} lang={code}>
                  <Menu.ItemText>{name}</Menu.ItemText>
                  <Menu.ItemIndicator>
                    <Check />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
