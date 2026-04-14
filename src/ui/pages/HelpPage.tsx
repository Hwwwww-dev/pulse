import React from "react";
import { Box, Text } from "ink";

export function HelpPage(): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Keybindings"),
    React.createElement(Text, null, " Tab / Shift+Tab   switch page"),
    React.createElement(Text, null, " ↑ ↓               select"),
    React.createElement(Text, null, " Enter             edit"),
    React.createElement(Text, null, " a / d             add / delete item"),
    React.createElement(Text, null, " n / D             add / delete line"),
    React.createElement(Text, null, " J / K             move item up/down"),
    React.createElement(Text, null, " s                 save"),
    React.createElement(Text, null, " r                 reload"),
    React.createElement(Text, null, " q / Ctrl+C        quit"),
  );
}
