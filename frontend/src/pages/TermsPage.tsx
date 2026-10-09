import { Container, Heading } from "@chakra-ui/react"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { termsMeta } from "../seo"

/** Placeholder until the terms are written. */
export function TermsPage() {
  const { t } = useI18n()
  usePageMeta(termsMeta(t))
  return (
    <Container maxW="3xl" px={{ base: "4", md: "6" }} pt={{ base: "8", md: "12" }}>
      <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }} fontWeight="800" letterSpacing="-0.03em" lineHeight="1.1">
        {t("terms.title")}
      </Heading>
    </Container>
  )
}
