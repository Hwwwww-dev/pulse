// Single source of truth for the pulse CLI version.
// Bun inlines the JSON import at build time, so this resolves to a literal
// string in the bundled dist/pulse.js.
import pkg from "../package.json" with { type: "json" };
export const VERSION: string = pkg.version;
