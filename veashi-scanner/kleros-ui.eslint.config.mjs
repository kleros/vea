// Written by kleros-ui init: what ui:check and ui:baseline lint with (eslint -c this file), the app's own lint config
// plus the Kleros UI preset. The app's own lint does not read this file, so its existing code passes there as before.
import app from "./eslint.config.mjs";
import klerosUI from "@kleros/ui-components-library/eslint";

export default [...[await app].flat(), ...klerosUI({ cssEntry: "globals.css", files: ["**/*.{js,jsx,ts,tsx}"] })];
