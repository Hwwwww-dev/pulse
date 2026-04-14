import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { readGeneral, readIndex } from "../../core/cache.ts";
import { paths } from "../../core/paths.ts";

export function DiagnosticsPage(): React.ReactElement {
  const [generalExists, setGeneralExists] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const g = await readGeneral();
      setGeneralExists(g !== undefined);
      const idx = await readIndex();
      setSessionCount(idx?.sessions.length ?? 0);
    })();
  }, []);

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Diagnostics"),
    React.createElement(Text, null, ` Config path    ${paths.configFile()}`),
    React.createElement(Text, null, ` Cache dir      ${paths.cacheDir()}`),
    React.createElement(Text, null, ` general.json   ${generalExists ? "exists" : "missing"}`),
    React.createElement(Text, null, ` Sessions       ${sessionCount}`),
    React.createElement(Text, null, ` Bun            ${Bun.version}`),
    React.createElement(Text, null, ` Pulse          0.1.0`),
  );
}
