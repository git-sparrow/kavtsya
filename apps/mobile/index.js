// Explicit entry point. The default `expo/AppEntry.js` resolves `../../App`
// relative to the expo package, which breaks under pnpm's node_modules layout.
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
