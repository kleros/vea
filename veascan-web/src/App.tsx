import React from "react";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { FilterDropdown } from "./components/FilterDropdown";

const App = () => (
  <div>
    <Navbar />
    <Footer />
    <FilterDropdown />
  </div>
);

export default App;
