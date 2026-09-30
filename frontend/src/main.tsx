import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ChakraProvider } from "@chakra-ui/react"
import { BrowserRouter } from "react-router"
import { system } from "./theme"
import App from "./App"
import { MushroomsProvider } from "./hooks/useMushrooms"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <MushroomsProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MushroomsProvider>
    </ChakraProvider>
  </StrictMode>,
)
