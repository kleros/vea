import { useCallback, useState, useLayoutEffect, useEffect } from "react";

interface Position {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

type T = HTMLElement;

export const useElementOffsets: () => [
  (node: T | null) => void,
  Position
] = () => {
  const [ref, setRef] = useState<T | null>(null);
  const [position, setPosition] = useState<Position>({
    width: 0,
    height: 0,
    offsetTop: 0,
    offsetLeft: 0,
  });

  const handleResize = useCallback(() => {
    setPosition({
      width: ref?.offsetWidth || 0,
      height: ref?.offsetHeight || 0,
      offsetTop: ref?.offsetTop || 0,
      offsetLeft: ref?.offsetLeft || 0,
    });
  }, [ref?.offsetHeight, ref?.offsetWidth, ref?.offsetTop, ref?.offsetLeft]);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  useLayoutEffect(() => {
    handleResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.offsetHeight, ref?.offsetWidth, ref?.offsetTop, ref?.offsetLeft]);

  return [setRef, position];
};
