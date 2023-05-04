import {} from "styled-components";
import { theme } from "./src/styles/themes";

declare global {
  module "*.svg" {
    const content: React.FC<React.SVGAttributes<SVGElement>>;
    export default content;
  }
}

declare module "styled-components" {
  type Theme = typeof theme;
  //eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends Theme {}
}
