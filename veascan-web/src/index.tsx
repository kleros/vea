import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "styles/global-style";
import { theme } from "styles/themes";
import App from "./App";

const WebApp = () => (
  <React.StrictMode>
    <ThemeProvider {...{ theme }}>
      <GlobalStyle />
      <App />
      {/* <TxCard
        title="Creator"
        chain="Ethereum"
        txHash="0x1234585f4ecaab46b138ec8d87238da442eeab9b"
        timestamp="Mar 30, 2023 15:25:23pm"
        caller="0x1234585f4ecaab46b138ec8d87238da442eeab9b"
      />
      <TxCard
        title="Verifier"
        chain="Arbitrum"
        txHash="0x1234585f4ecaab46b138ec8d87238da442eeab9b"
        timestamp="Mar 30, 2023 15:25:23pm"
        caller="0x1234585f4ecaab46b138ec8d87238da442eeab9b"
        extraFields={[{ key: "State Root", value: "0x2a3d585f4ecaab46b138ec8d87238da44b32eeab", isCopy: true }]}
      /> */}
    </ThemeProvider>
  </React.StrictMode>
);

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<WebApp />);
}
