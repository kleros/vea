import type { FlatRouteFile } from "./types";

import route_0 from "./addresses/1514-42161.json";
import route_1 from "./addresses/42161-1514.json";
import route_2 from "./addresses/421614-10200.json";
import route_3 from "./addresses/421614-11155111.json";

export const ROUTES: Record<string, FlatRouteFile> = {
  "1514-42161": route_0,
  "42161-1514": route_1,
  "421614-10200": route_2,
  "421614-11155111": route_3,
};
