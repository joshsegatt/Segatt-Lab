fn main() {
  // app.manifest asks Windows for elevation: tweaks, cleanup and fixes write to
  // HKLM and C:\Windows. It was never embedded before, so the app ran without
  // admin rights. Debug builds stay asInvoker so `tauri dev` can launch them
  // from a normal terminal.
  println!("cargo:rerun-if-changed=app.manifest");
  let mut manifest = std::fs::read_to_string("app.manifest").expect("read app.manifest");
  if std::env::var("PROFILE").as_deref() != Ok("release") {
    manifest = manifest.replace("requireAdministrator", "asInvoker");
  }

  tauri_build::try_build(
    tauri_build::Attributes::new()
      .windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(manifest)),
  )
  .expect("failed to run tauri build script");
}
