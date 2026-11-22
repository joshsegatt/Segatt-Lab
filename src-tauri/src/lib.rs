mod features;

use crate::features::packages::{list_installed, run_app_action, search_packages};
use crate::features::tweaks::{check_admin, create_restore_point, open_system_restore};
use crate::features::engine::{get_tweak_states, set_tweak};
use crate::features::cleaner::run_cleanup;
use crate::features::system::{get_pc_info, get_system_stats, open_legacy_panel, run_system_fix, SystemState};
use sysinfo::System;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  builder = builder
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_opener::init());

  if cfg!(debug_assertions) {
    builder = builder.plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    );
  }

  builder
    .manage(SystemState(Mutex::new(System::new_all())))
    .setup(|_app| {
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      search_packages,
      list_installed,
      run_app_action,
      get_tweak_states,
      set_tweak,
      open_system_restore,
      create_restore_point,
      check_admin,
      run_cleanup,
      get_system_stats,
      get_pc_info,
      open_legacy_panel,
      run_system_fix
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

