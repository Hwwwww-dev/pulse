import { render } from "ink";
import React from "react";
import { App } from "./App.tsx";

export async function runConfigUi(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
