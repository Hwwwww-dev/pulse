import type { TextStyle } from "../core/types.ts";

export interface Theme {
  name: string;
  defaults: {
    itemStyle: TextStyle;
    lineBg?: string;
  };
}

export const THEMES: Record<string, Theme> = {
  minimal: { name: "minimal", defaults: { itemStyle: {} } },
  pastel: {
    name: "pastel",
    defaults: { itemStyle: { fg: "#C792EA" } },
  },
  powerline: {
    name: "powerline",
    defaults: { itemStyle: { fg: "#FFFFFF", bold: true }, lineBg: "#1e1e2e" },
  },
};
