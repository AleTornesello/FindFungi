import { Box, Button, Link as ChakraLink, Container, Flex, HStack, Image, Menu, Portal, Text } from "@chakra-ui/react"
import { Link, NavLink, Outlet } from "react-router"
import { BookOpen, Check, Coffee, Globe, Heart, Languages, Mail, NotebookPen, type LucideIcon } from "lucide-react"
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

      <Box as="main" flex="1" pb="12">
        <Outlet />
      </Box>

      {/* Bottom padding on phones keeps the footer clear of the fixed BottomNav. */}
      <Box as="footer" borderTopWidth="1px" borderColor="border" pt="6" pb={{ base: "28", md: "6" }}>
        <Container maxW="6xl" px={{ base: "4", md: "6" }}>
          <Text fontSize="sm" color="fg.muted">
            {t("app.disclaimer")}
          </Text>
          <SupportNote />
          <AuthorCredit />
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
        <Image src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" htmlWidth="28" htmlHeight="28" w="7" h="7" />
        <Text fontFamily="heading" fontWeight="800" fontSize="xl" letterSpacing="-0.02em">
          find<Box as="span" color="chanterelle.400">fungi</Box>
        </Text>
      </HStack>
    </Link>
  )
}

const AUTHOR = {
  name: "Alessandro Tornesello",
  links: [
    { label: "Email", href: "mailto:alessandro.tornesello99@gmail.com", icon: Mail },
    { label: "Website", href: "https://alessandrotornesello.dev", icon: Globe },
    { label: "GitHub", href: "https://github.com/AleTornesello", icon: GitHubIcon },
  ],
}

const KOFI_URL = "https://ko-fi.com/alessandrotornesello"

function SupportNote() {
  const { t } = useI18n()
  return (
    <Flex mt="3" align="center" gap="3" wrap="wrap" fontSize="sm" color="fg.muted">
      <Text>{t("app.support")}</Text>
      <Button asChild size="sm" borderRadius="full" bg="chanterelle.400" color="soil.900" _hover={{ bg: "chanterelle.300" }}>
        <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
          <Coffee aria-hidden />
          {t("app.supportCta")}
        </a>
      </Button>
    </Flex>
  )
}

function AuthorCredit() {
  const { t } = useI18n()
  return (
    <Flex mt="3" align="center" gap="3" wrap="wrap" fontSize="sm" color="fg.muted">
      <Text>
        {t("app.madeWith")}{" "}
        <Box as="span" display="inline-flex" verticalAlign="-0.125em" color="red.500">
          <Heart size="1em" fill="currentColor" role="img" aria-label={t("app.love")} />
        </Box>{" "}
        {t("app.madeBy")}{" "}
        <Text as="span" fontWeight="600" color="fg">
          {AUTHOR.name}
        </Text>
      </Text>
      <HStack as="ul" aria-label={t("app.author")} gap="1" listStyleType="none">
        {AUTHOR.links.map(({ label, href, icon: Icon }) => (
          <li key={label}>
            <ChakraLink
              href={href}
              aria-label={label}
              title={label}
              {...(href.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}
              display="inline-flex"
              p="1.5"
              borderRadius="full"
              color="fg.muted"
              _hover={{ color: "fg", bg: "bg.muted" }}
            >
              <Icon size={18} aria-hidden />
            </ChakraLink>
          </li>
        ))}
      </HStack>
    </Flex>
  )
}

/** lucide dropped brand marks, so the GitHub logo is inlined. */
function GitHubIcon({ size = 24 }: { size?: number; "aria-hidden"?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
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
