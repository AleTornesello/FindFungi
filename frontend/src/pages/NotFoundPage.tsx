import { Button, Container, Heading, Text } from "@chakra-ui/react"
import { Link } from "react-router"
import { useI18n } from "../i18n/I18nProvider"

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <Container maxW="md" px="4" pt="16" textAlign="center">
      <Heading as="h1" fontSize="4xl" fontWeight="800">
        {t("notFound.title")}
      </Heading>
      <Text color="fg.muted" mt="3">
        {t("notFound.body")}
      </Text>
      <Button asChild mt="6" borderRadius="full" colorPalette="moss">
        <Link to="/">{t("notFound.cta")}</Link>
      </Button>
    </Container>
  )
}
