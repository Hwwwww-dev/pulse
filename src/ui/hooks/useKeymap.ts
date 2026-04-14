import { useInput, useApp } from "ink";

export interface Keymap {
  enabled?: boolean;
  onTab?: () => void;
  onShiftTab?: () => void;
  onSave?: () => void;
  onReload?: () => void;
  onQuit?: () => void;
}

export function useKeymap(km: Keymap): void {
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.tab && !key.shift && km.onTab) km.onTab();
    else if (key.tab && key.shift && km.onShiftTab) km.onShiftTab();
    else if (input === "s" && km.onSave) km.onSave();
    else if (input === "r" && km.onReload) km.onReload();
    else if (input === "q") {
      if (km.onQuit) km.onQuit();
      else exit();
    }
  }, { isActive: km.enabled !== false });
}
