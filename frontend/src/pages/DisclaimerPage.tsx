import { Fragment, type ReactNode } from "react"
import { Box, Link as ChakraLink, Container, Flex, Heading, List, Stack, Text } from "@chakra-ui/react"
import { TriangleAlert } from "lucide-react"
import { DISCLAIMER, DISCLAIMER_ORIGINAL, DISCLAIMER_UPDATED, type LegalBlock } from "../data/disclaimer"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { disclaimerMeta } from "../seo"

export function DisclaimerPage() {
  const { locale, t } = useI18n()
  usePageMeta(disclaimerMeta(t))
  const doc = DISCLAIMER[locale]
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(`${DISCLAIMER_UPDATED}T00:00:00`))

  return (
    <Container maxW="3xl" px={{ base: "4", md: "6" }} pt={{ base: "8", md: "12" }}>
      <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }} fontWeight="800" letterSpacing="-0.03em" lineHeight="1.1">
        {t("legal.title")}
      </Heading>
      <Text color="fg.muted" mt="3" fontSize="sm">
        {t("legal.updated", { date: updated })}
      </Text>
      {locale !== DISCLAIMER_ORIGINAL && (
        <Text color="fg.muted" mt="1" fontSize="sm">
          {t("legal.translationNote")}
        </Text>
      )}

      <Stack gap="4" mt="8">
        {doc.intro.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </Stack>

      <Box as="ol" listStyleType="none" mt="10">
        {doc.sections.map((section, i) => (
          <Box as="li" key={section.title} mt={i ? "10" : "0"}>
            <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} fontWeight="800" letterSpacing="-0.02em">
              <Box as="span" color="fg.muted" mr="2">
                {i + 1}.
              </Box>
              {section.title}
            </Heading>
            <Stack gap="4" mt="4">
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Container>
  )
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <Text lineHeight="1.7">{inline(block)}</Text>
  if (!Array.isArray(block))
    return (
      <Flex align="center" gap="3" px="4" py="3" borderRadius="xl" bg="amanita.solid" color="amanita.contrast">
        <Box flexShrink={0}>
          <TriangleAlert size={22} aria-hidden />
        </Box>
        <Heading as="h3" fontSize="md" fontWeight="800" textTransform="uppercase" letterSpacing="0.04em" lineHeight="1.4">
          {block.warning}
        </Heading>
      </Flex>
    )
  return (
    <List.Root gap="1.5" ps="5" lineHeight="1.7">
      {block.map((item) => (
        <List.Item key={item}>{inline(item)}</List.Item>
      ))}
    </List.Root>
  )
}

/** Renders the `**bold**` and `[label](href)` markup used in the disclaimer text. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const bold = /^\*\*(.+)\*\*$/.exec(part)
    if (bold) return <strong key={i}>{inline(bold[1])}</strong>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link)
      return (
        <ChakraLink key={i} href={link[2]} color="moss.fg" textDecoration="underline">
          {link[1]}
        </ChakraLink>
      )
    return <Fragment key={i}>{part}</Fragment>
  })
}
