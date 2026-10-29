use anyhow::Result;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const RULES: &str = include_str!("../../drivers/linux/99-ch340-k4.rules");

fn bundled_rules_path_for(root: &Path) -> PathBuf {
    root.join("drivers/linux/99-ch340-k4.rules")
}

pub fn install(drivers_root: &Path) -> Result<String> {
    let bundled = bundled_rules_path_for(drivers_root);
    if bundled.exists() {
        if let Ok(data) = fs::read_to_string(&bundled) {
            return try_write_system_rules(&data);
        }
    }
    try_write_system_rules(RULES)
}

fn try_write_system_rules(rules: &str) -> Result<String> {
    let rules_path = "/etc/udev/rules.d/99-ch340-k4.rules";
    match fs::write(rules_path, rules) {
        Ok(_) => {
            let _ = std::process::Command::new("udevadm")
                .args(["control", "--reload-rules"])
                .output();
            let _ = std::process::Command::new("udevadm")
                .args(["trigger"])
                .output();
            Ok("udev rule installed. Reconnect your K4.".into())
        }
        Err(_) => Ok(format!(
            "Could not write {rules_path} (needs root). Run:\n\
sudo cp <path-to>/99-ch340-k4.rules {rules_path}\n\
sudo udevadm control --reload-rules && sudo udevadm trigger\n\
sudo usermod -aG dialout $USER\n\
# then log out and back in\n\n\
Rule file contents:\n{rules}"
        )),
    }
}
