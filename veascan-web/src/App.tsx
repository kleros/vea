import React from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useSnapshots } from "hooks/useSnapshots";

const App = () => {
  const { data } = useSnapshots("999999999999");
  console.log(data);
  return (
    <div>
      <Navbar />
      <Footer />
    </div>
  );
};

export default App;
