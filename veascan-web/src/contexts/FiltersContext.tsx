import React, { useState, createContext, useContext } from "react";

interface IFilters {
  fromChain: number;
  toChain: number;
  setFromChain: (arg0: number) => void;
  setToChain: (arg0: number) => void;
}

const Context = createContext<IFilters>({
  fromChain: 0,
  toChain: 0,
  setFromChain: () => {
    //
  },
  setToChain: () => {
    //
  },
});

export const FiltersContext: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const [fromChain, setFromChain] = useState(0);
  const [toChain, setToChain] = useState(0);
  return (
    <Context.Provider value={{ fromChain, toChain, setFromChain, setToChain }}>
      {children}
    </Context.Provider>
  );
};

export const useFiltersContext = () => useContext(Context);
