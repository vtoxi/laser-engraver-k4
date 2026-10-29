# WCH CH340 / CH341 Windows driver (optional bundle)

Tauri bundles anything you place under `src-tauri/drivers/**` into the app `resources` folder next to the executable.

1. Download the official **CH341SER** Windows driver package from WCH (e.g. [WCH downloads](https://www.wch.cn/downloads/CH341SER_EXE.html)).
2. Extract `CH341SER.INF`, `CH341SER.SYS`, and `CH341SER.CAT` (names may vary slightly) into this directory:  
   `src-tauri/drivers/windows/`
3. Rebuild the app. The in-app **Install Driver** action will try `pnputil` against `CH341SER.INF`, or fall back to launching the INF install UI.

Do not commit proprietary driver binaries to a public repository unless your license allows it.
