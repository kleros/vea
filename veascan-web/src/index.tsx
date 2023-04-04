import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "styles/global-style";
import { theme } from "styles/themes";

const App = () => (
  <React.StrictMode>
    <ThemeProvider {...{ theme }}>
      <GlobalStyle />
      <h1>Hey</h1>
    </ThemeProvider>
  </React.StrictMode>
);

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
