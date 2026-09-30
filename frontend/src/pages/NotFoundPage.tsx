import { Button, Container, Heading, Text } from "@chakra-ui/react"
import { Link } from "react-router"

export function NotFoundPage() {
  return (
    <Container maxW="md" px="4" pt="16" textAlign="center">
      <Heading as="h1" fontSize="4xl" fontWeight="800">
        This page isn't here
      </Heading>
      <Text color="fg.muted" mt="3">
        The link may be old or mistyped.
      </Text>
      <Button asChild mt="6" borderRadius="full" colorPalette="moss">
        <Link to="/">Browse species</Link>
      </Button>
    </Container>
  )
}
