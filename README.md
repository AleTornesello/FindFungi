# FindFungi

A mobile-first web app for mushroom foragers: see what's fruiting this month, learn the common species, and keep a log of your finds.

Built with React 19, TypeScript, Vite, Chakra UI v3 and React Router.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Structure

```
src/
  theme.ts                  Chakra system: soil / moss / lichen / chanterelle palettes, fonts
  main.tsx                  Providers (Chakra, router)
  App.tsx                   Routes
  components/
    Layout.tsx              Header, desktop nav, mobile bottom tab bar
    MushroomIllustration.tsx Recolorable SVG mushroom
    SpeciesCard.tsx         Species card with season strip
  data/species.ts           Sample species data
  hooks/useFinds.ts         Find log persisted to localStorage
  pages/                    Home, Explore (species), Finds, 404
```

> Never eat a wild mushroom based on an app. Always have finds checked by an expert.
