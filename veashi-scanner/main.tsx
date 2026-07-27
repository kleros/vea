import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./Layout";
import Home from "./pages/Home";
import TransactionPage from "./pages/TxPage";
import RoutesPage from "./pages/RoutesPage";
import "./globals.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/routes", element: <RoutesPage /> },
      // Catch-all: /tx/{sourceChainId}/{txHash} (or /tx/{txHash})
      { path: "/tx/*", element: <TransactionPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
