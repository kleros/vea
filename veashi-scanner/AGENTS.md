# Agent guide

<!-- kleros-ui:start 3.11.0-beta.1 -->
## UI: `@kleros/ui-components-library` 3.11.0-beta.1 (Tailwind 4 + react-aria). Not v2: no styled-components, ThemeProvider, Field.
1. Before writing any UI piece, look it up in node_modules/@kleros/ui-components-library/agent/CATALOG.md and in kleros-ui.json. Use or compose what is there; never hand-roll a near-copy.
2. Not there, or a piece you show in two or more places (a COMPOSE included): make it one named component with `npx -p @kleros/ui-components-library kleros-ui new <Name> --kind ui|data|form --intent "words"` (or the steps in node_modules/@kleros/ui-components-library/agent/NEW-COMPONENT.md), fill it in, and use that component in each place. Don't copy the markup. --intent takes what someone would search for, comma-separated.
3. Tailwind only: utility classes in className, and Stack/Inline/Grid/Section/Page/FormStack from /kit for layout. No CSS of your own: the Tailwind entry (kleros-ui.json "cssEntry"; src/index.css in a new app) stays as create (or AGENTS.md "Existing apps") wrote it, plus the theme import of rule 4, and no other .css (the theme file aside), <style> or CSS-in-JS; inline style only for a computed size. Spacing steps 0.5 1 2 3 4 6 8 12 16 only; no arbitrary values.
4. Colour: klerosUIComponents* tokens or a StatusBadge tone. No palette classes, no hex (in .css files too), no dark: overrides (.dark flips tokens). A new look is a theme: `npx -p @kleros/ui-components-library kleros-ui theme` writes the app's one theme file (src/theme.css; kleros-ui.json "theme" names it) and imports it. It is the only place to redefine a --klerosUIComponents* token, hex values included: inside its `@layer base`, on :root (light) and :root.dark (dark), with the library's own token names only. Nowhere else.
5. Every data view, real or mock: QueryState (a mock passes isLoading={false}; no fake delay or error). Forms: core fields' label/variant/message, Button isLoading, AlertMessage for the result.
6. Don't invent tokens or a palette. If the scale lacks a value, say so in your summary.
7. API, shapes, traps: node_modules/@kleros/ui-components-library/agent/AGENTS.md. Look: node_modules/@kleros/ui-components-library/agent/LOOK.md. Catalogue: node_modules/@kleros/ui-components-library/agent/CATALOG.md.
8. Done = `npm run ui:check` passes (tsc, lint, the app's CSS, setup). Lint messages name the token or component to use.
<!-- kleros-ui:end -->
