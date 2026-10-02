import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

// Palette is taken from the forest floor: soil, bark, moss, lichen and chanterelle.
const config = defineConfig({
  globalCss: {
    "html, body": {
      bg: "bg",
      color: "fg",
      fontFamily: "body",
    },
    "*:focus-visible": {
      outline: "3px solid",
      outlineColor: "lichen.400",
      outlineOffset: "2px",
    },
    "*, *::before, *::after": {
      _motionReduce: {
        animationDuration: "0.01ms !important",
        transitionDuration: "0.01ms !important",
      },
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "'Bricolage Grotesque', system-ui, sans-serif" },
        body: { value: "'Figtree', system-ui, sans-serif" },
      },
      colors: {
        soil: {
          50: { value: "#F6EFE8" },
          100: { value: "#E9D9C8" },
          200: { value: "#D2B395" },
          300: { value: "#B58962" },
          400: { value: "#96663E" },
          500: { value: "#7A4E2D" },
          600: { value: "#613D23" },
          700: { value: "#4A2F1C" },
          800: { value: "#3A2618" },
          900: { value: "#2E1F14" },
          950: { value: "#1E140D" },
        },
        moss: {
          50: { value: "#F0F6E8" },
          100: { value: "#DCEBC8" },
          200: { value: "#BCD99A" },
          300: { value: "#98C26A" },
          400: { value: "#78A845" },
          500: { value: "#5E8C31" },
          600: { value: "#487026" },
          700: { value: "#37561F" },
          800: { value: "#29411A" },
          900: { value: "#1D2F13" },
          950: { value: "#111D0B" },
        },
        lichen: {
          50: { value: "#F7FBE5" },
          100: { value: "#EDF6C4" },
          200: { value: "#DDEC8E" },
          300: { value: "#C9E05B" },
          400: { value: "#B5D33D" },
          500: { value: "#98B527" },
          600: { value: "#768D1C" },
          700: { value: "#586A18" },
          800: { value: "#465418" },
          900: { value: "#3B4718" },
          950: { value: "#1F2708" },
        },
        chanterelle: {
          50: { value: "#FEF6E7" },
          100: { value: "#FCE8C3" },
          200: { value: "#F7D08A" },
          300: { value: "#F2B955" },
          400: { value: "#E8A33D" },
          500: { value: "#D08722" },
          600: { value: "#AD6A18" },
          700: { value: "#8A5017" },
          800: { value: "#713F18" },
          900: { value: "#5E3517" },
          950: { value: "#361B09" },
        },
        // Fly agaric red, kept for poisonous species.
        amanita: {
          50: { value: "#FDEEEB" },
          100: { value: "#FAD6CF" },
          200: { value: "#F3AA9C" },
          300: { value: "#EA7D68" },
          400: { value: "#E0533A" },
          500: { value: "#C73E27" },
          600: { value: "#A2311F" },
          700: { value: "#80271A" },
          800: { value: "#621F16" },
          900: { value: "#4A1912" },
          950: { value: "#2C0D09" },
        },
      },
      radii: {
        cap: { value: "999px 999px 28px 28px" },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: { value: { _light: "#F3F6EA", _dark: "{colors.soil.950}" } },
          subtle: { value: { _light: "#E8EEDA", _dark: "{colors.soil.900}" } },
          panel: { value: { _light: "#FFFFFF", _dark: "{colors.soil.800}" } },
        },
        fg: {
          DEFAULT: { value: { _light: "{colors.soil.900}", _dark: "{colors.soil.50}" } },
          muted: { value: { _light: "{colors.soil.600}", _dark: "{colors.soil.200}" } },
        },
        border: {
          DEFAULT: { value: { _light: "#D6DEC2", _dark: "{colors.soil.700}" } },
        },
        moss: {
          solid: { value: "{colors.moss.500}" },
          contrast: { value: "white" },
          fg: { value: { _light: "{colors.moss.700}", _dark: "{colors.moss.300}" } },
          muted: { value: { _light: "{colors.moss.100}", _dark: "{colors.moss.900}" } },
          subtle: { value: { _light: "{colors.moss.50}", _dark: "{colors.moss.950}" } },
          emphasized: { value: { _light: "{colors.moss.200}", _dark: "{colors.moss.800}" } },
          focusRing: { value: "{colors.moss.400}" },
        },
        soil: {
          solid: { value: "{colors.soil.700}" },
          contrast: { value: "white" },
          fg: { value: { _light: "{colors.soil.700}", _dark: "{colors.soil.200}" } },
          muted: { value: { _light: "{colors.soil.100}", _dark: "{colors.soil.800}" } },
          subtle: { value: { _light: "{colors.soil.50}", _dark: "{colors.soil.900}" } },
          emphasized: { value: { _light: "{colors.soil.200}", _dark: "{colors.soil.700}" } },
          focusRing: { value: "{colors.soil.400}" },
        },
        chanterelle: {
          solid: { value: "{colors.chanterelle.400}" },
          contrast: { value: "{colors.soil.900}" },
          fg: { value: { _light: "{colors.chanterelle.700}", _dark: "{colors.chanterelle.300}" } },
          muted: { value: { _light: "{colors.chanterelle.100}", _dark: "{colors.chanterelle.900}" } },
          subtle: { value: { _light: "{colors.chanterelle.50}", _dark: "{colors.chanterelle.950}" } },
          emphasized: { value: { _light: "{colors.chanterelle.200}", _dark: "{colors.chanterelle.800}" } },
          focusRing: { value: "{colors.chanterelle.400}" },
        },
        amanita: {
          solid: { value: "{colors.amanita.600}" },
          contrast: { value: "white" },
          fg: { value: { _light: "{colors.amanita.700}", _dark: "{colors.amanita.300}" } },
          muted: { value: { _light: "{colors.amanita.100}", _dark: "{colors.amanita.900}" } },
          subtle: { value: { _light: "{colors.amanita.50}", _dark: "{colors.amanita.950}" } },
          emphasized: { value: { _light: "{colors.amanita.200}", _dark: "{colors.amanita.800}" } },
          focusRing: { value: "{colors.amanita.400}" },
        },
        lichen: {
          solid: { value: "{colors.lichen.400}" },
          contrast: { value: "{colors.soil.900}" },
          fg: { value: { _light: "{colors.lichen.700}", _dark: "{colors.lichen.300}" } },
          muted: { value: { _light: "{colors.lichen.100}", _dark: "{colors.lichen.900}" } },
          subtle: { value: { _light: "{colors.lichen.50}", _dark: "{colors.lichen.950}" } },
          emphasized: { value: { _light: "{colors.lichen.200}", _dark: "{colors.lichen.800}" } },
          focusRing: { value: "{colors.lichen.400}" },
        },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)
