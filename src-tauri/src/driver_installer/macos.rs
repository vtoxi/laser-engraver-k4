use anyhow::Result;
use std::path::Path;
use std::process::Command;

pub fn install(drivers_root: &Path) -> Result<String> {
    let pkg = drivers_root.join("drivers/macos/CH34xVCPDriver.pkg");
    if pkg.exists() {
        Command::new("open").arg(&pkg).spawn()?;
        return Ok("Opened bundled CH34xVCPDriver.pkg — follow the installer prompts.".into());
    }

    let _ = Command::new("open")
        .arg("https://www.wch.cn/downloads/CH341SER_MAC_ZIP.html")
        .spawn();
    Ok("No bundled macOS driver package found. Opened the WCH CH34x macOS driver download page in your browser.".into())
}
