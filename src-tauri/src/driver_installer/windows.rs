use anyhow::{anyhow, Result};
use std::path::Path;
use std::process::Command;

/// Expected: `<resource>/drivers/windows/CH341SER.INF` (from Tauri `bundle.resources`).
pub fn install(drivers_root: &Path) -> Result<String> {
    let inf = drivers_root.join("drivers/windows/CH341SER.INF");
    if !inf.exists() {
        return Ok(
            "CH341 Windows driver files are not bundled. See src-tauri/drivers/windows/README.txt for where to download CH341SER and how to install."
                .into(),
        );
    }

    let output = Command::new("pnputil")
        .args([
            "/add-driver",
            inf.to_str().ok_or_else(|| anyhow!("invalid UTF-8 path"))?,
            "/install",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => Ok("CH340/CH341 driver staged with pnputil successfully.".into()),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let _ = Command::new("rundll32")
                .args([
                    "setupapi.dll,InstallHinfSection",
                    "DefaultInstall",
                    "132",
                    inf.to_str().unwrap_or(""),
                ])
                .spawn();
            Ok(format!(
                "pnputil reported an issue ({}). Launched INF install UI as fallback.",
                stderr.trim()
            ))
        }
        Err(_) => Err(anyhow!(
            "pnputil not found. Install the driver from WCH or Device Manager using the INF in drivers/windows/."
        )),
    }
}
