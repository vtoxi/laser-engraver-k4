use std::path::PathBuf;

use anyhow::Result;
use tauri::AppHandle;
use tauri::Manager;

pub fn install(app: &AppHandle) -> Result<String> {
    let root = drivers_root(app);
    #[cfg(target_os = "windows")]
    {
        return windows::install(&root);
    }
    #[cfg(target_os = "macos")]
    {
        return macos::install(&root);
    }
    #[cfg(target_os = "linux")]
    {
        return linux::install(&root);
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux"
    )))]
    {
        Ok("Driver installation not supported on this platform.".into())
    }
}

fn drivers_root(app: &AppHandle) -> PathBuf {
    if let Ok(p) = app.path().resource_dir() {
        return p;
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let resources = dir.join("resources");
            if resources.is_dir() {
                return resources;
            }
            return dir.to_path_buf();
        }
    }
    PathBuf::new()
}

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "linux")]
mod linux;
