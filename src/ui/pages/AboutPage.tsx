import React from "react";
import { Box, Text } from "ink";
import { VERSION } from "../../version.ts";

const REPO_URL = "https://github.com/Hwwwww-dev/pulse";

export function AboutPage(): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "About"),
    React.createElement(Box, { marginTop: 1, flexDirection: "column" },
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  Name:        "),
        React.createElement(Text, { bold: true }, "@hwwwww/pulse"),
      ),
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  Version:     "),
        React.createElement(Text, null, `v${VERSION}`),
      ),
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  Description: "),
        React.createElement(Text, null, "Lightweight Claude Code statusline"),
      ),
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  Repository:  "),
        React.createElement(Text, { color: "cyan" }, REPO_URL),
      ),
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  Author:      "),
        React.createElement(Text, null, "hwwwww"),
      ),
      React.createElement(Text, null,
        React.createElement(Text, { dimColor: true }, "  License:     "),
        React.createElement(Text, null, "MIT"),
      ),
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { color: "yellow" }, "  ★ "),
      React.createElement(Text, null, "If you like pulse, please give it a "),
      React.createElement(Text, { color: "yellow", bold: true }, "Star"),
      React.createElement(Text, null, " on GitHub! "),
      React.createElement(Text, { color: "magenta" }, "♥"),
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true }, "  Thanks for using pulse — your support keeps it growing."),
    ),
  );
}
