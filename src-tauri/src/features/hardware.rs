//! Reads what the PC is made of (board, CPU, GPU, RAM, system disk, display,
//! Windows) through CIM, read-only and without admin. Nothing leaves the PC.

use serde::{Deserialize, Deserializer, Serialize};

use crate::features::utils::run_hidden_powershell;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Board {
    pub maker: Option<String>,
    pub model: Option<String>,
    pub bios_version: Option<String>,
    pub bios_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Cpu {
    pub name: Option<String>,
    pub cores: Option<u32>,
    pub threads: Option<u32>,
    /// Base clock as Windows reports it, not the boost clock.
    pub base_mhz: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Gpu {
    pub name: Option<String>,
    pub driver: Option<String>,
    /// From the driver key; Win32_VideoController.AdapterRAM stops at 4 GB.
    pub vram_bytes: Option<u64>,
    pub refresh_hz: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RamStick {
    pub bytes: Option<u64>,
    /// Speed the module is rated for, in MT/s.
    pub rated_mts: Option<u32>,
    /// Speed it actually runs at, in MT/s.
    pub configured_mts: Option<u32>,
    /// "DDR4", "DDR5"... from SMBIOSMemoryType.
    pub kind: Option<String>,
    pub maker: Option<String>,
    pub part: Option<String>,
    pub slot: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Disk {
    pub model: Option<String>,
    /// "SSD", "HDD" or "Unspecified".
    pub media: Option<String>,
    /// "NVMe", "SATA", "USB"...
    pub bus: Option<String>,
    pub bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Os {
    pub name: Option<String>,
    pub version: Option<String>,
    pub build: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Hardware {
    pub board: Board,
    pub cpu: Cpu,
    #[serde(deserialize_with = "one_or_many")]
    pub gpus: Vec<Gpu>,
    #[serde(deserialize_with = "one_or_many")]
    pub ram: Vec<RamStick>,
    pub system_disk: Option<Disk>,
    pub os: Os,
    /// From the chassis type, not from a battery: a desktop on a UPS reports one too.
    pub laptop: bool,
    pub on_battery: bool,
}

/// PowerShell turns a one-item list into a bare object; accept both (and null).
pub(crate) fn one_or_many<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany<T> {
        Many(Vec<T>),
        One(T),
    }
    Ok(match Option::<OneOrMany<T>>::deserialize(d)? {
        Some(OneOrMany::Many(v)) => v,
        Some(OneOrMany::One(x)) => vec![x],
        None => Vec::new(),
    })
}

/// Every query is read-only. A part that fails to read stays null instead of
/// failing the whole report.
const SCRIPT: &str = r#"
function Try-Get($block) { try { & $block } catch { $null } }
$board = Try-Get { Get-CimInstance Win32_BaseBoard | Select-Object -First 1 }
$bios = Try-Get { Get-CimInstance Win32_BIOS | Select-Object -First 1 }
$cpu = Try-Get { Get-CimInstance Win32_Processor | Select-Object -First 1 }
$os = Try-Get { Get-CimInstance Win32_OperatingSystem }
$cv = Try-Get { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }
$drivers = @(Try-Get {
  Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -match '^\d{4}$' } |
    ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue }
})
$gpus = @(Try-Get { Get-CimInstance Win32_VideoController } | Where-Object { $_ } | ForEach-Object {
  $v = $_
  $key = $drivers | Where-Object { $_.DriverDesc -eq $v.Name } | Select-Object -First 1
  $vram = Try-Get { if ($key -and $key.'HardwareInformation.qwMemorySize') { [int64]$key.'HardwareInformation.qwMemorySize' } }
  [pscustomobject]@{ name = $v.Name; driver = $v.DriverVersion; vramBytes = $vram; refreshHz = $v.CurrentRefreshRate; width = $v.CurrentHorizontalResolution; height = $v.CurrentVerticalResolution }
})
$kinds = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }
$ram = @(Try-Get { Get-CimInstance Win32_PhysicalMemory } | Where-Object { $_ } | ForEach-Object {
  [pscustomobject]@{ bytes = [int64]$_.Capacity; ratedMts = $_.Speed; configuredMts = $_.ConfiguredClockSpeed; kind = $kinds[[int]$_.SMBIOSMemoryType]; maker = $_.Manufacturer; part = ([string]$_.PartNumber).Trim(); slot = $_.DeviceLocator }
})
$disk = Try-Get {
  $num = (Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Select-Object -First 1).DiskNumber
  $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq [string]$num } | Select-Object -First 1
  if ($pd) { [pscustomobject]@{ model = $pd.FriendlyName; media = [string]$pd.MediaType; bus = [string]$pd.BusType; bytes = [int64]$pd.Size } }
}
$chassis = @(Try-Get { (Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1).ChassisTypes })
# SMBIOS portable types: Portable, Laptop, Notebook, Hand Held, Sub Notebook, Tablet, Convertible, Detachable.
$laptop = [bool]($chassis | Where-Object { $_ -in 8, 9, 10, 11, 14, 30, 31, 32 })
$battery = Try-Get { Get-CimInstance Win32_Battery | Select-Object -First 1 }
[pscustomobject]@{
  board = [pscustomobject]@{ maker = $board.Manufacturer; model = $board.Product; biosVersion = $bios.SMBIOSBIOSVersion; biosDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { $null } }
  cpu = [pscustomobject]@{ name = if ($cpu.Name) { $cpu.Name.Trim() } else { $null }; cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; baseMhz = $cpu.MaxClockSpeed }
  gpus = $gpus
  ram = $ram
  systemDisk = $disk
  os = [pscustomobject]@{ name = $os.Caption; version = $cv.DisplayVersion; build = if ($cv) { "$($cv.CurrentBuildNumber).$($cv.UBR)" } else { $null } }
  laptop = $laptop
  onBattery = [bool]($laptop -and $battery -and $battery.BatteryStatus -eq 1)
} | ConvertTo-Json -Depth 4 -Compress
"#;

pub fn parse(json: &str) -> Result<Hardware, String> {
    serde_json::from_str(json.trim()).map_err(|e| format!("Could not read the hardware report: {e}"))
}

/// Blocking: call it from a blocking thread.
pub fn read() -> Result<Hardware, String> {
    parse(&run_hidden_powershell(SCRIPT)?)
}

#[tauri::command]
pub async fn get_hardware() -> Result<Hardware, String> {
    tauri::async_runtime::spawn_blocking(read).await.map_err(|e| format!("Runtime error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    // Shape of the real report from this PC (MSI Z790, i7-14700K, RX 9070).
    const REAL: &str = r#"{"board":{"maker":"Micro-Star International Co., Ltd.","model":"MAG Z790 TOMAHAWK WIFI (MS-7D91)","biosVersion":"H.J0","biosDate":"2026-09-14"},"cpu":{"name":"Intel(R) Core(TM) i7-14700K","cores":20,"threads":28,"baseMhz":3400},"gpus":[{"name":"AMD Radeon RX 9070","driver":"32.0.32015.7029","vramBytes":17095983104,"refreshHz":280,"width":1920,"height":1080}],"ram":[{"bytes":17179869184,"ratedMts":5600,"configuredMts":5600,"kind":"DDR5","maker":"Kingston","part":"KF556C36-16","slot":"Controller0-DIMMA2"},{"bytes":17179869184,"ratedMts":5600,"configuredMts":5600,"kind":"DDR5","maker":"Kingston","part":"KF556C36-16","slot":"Controller1-DIMMB2"}],"systemDisk":{"model":"KINGSTON SNV3S1000G","media":"SSD","bus":"NVMe","bytes":1000204886016},"os":{"name":"Microsoft Windows 11 Pro","version":"26H2","build":"26300.10075"},"laptop":false,"onBattery":false}"#;

    #[test]
    fn reads_the_real_report() {
        let hw = parse(REAL).unwrap();
        assert_eq!(hw.cpu.threads, Some(28));
        assert_eq!(hw.gpus[0].vram_bytes, Some(17_095_983_104), "VRAM above 4 GB is kept");
        assert_eq!(hw.ram.len(), 2);
        assert_eq!(hw.ram[0].kind.as_deref(), Some("DDR5"));
        assert_eq!(hw.system_disk.unwrap().bus.as_deref(), Some("NVMe"));
        assert!(!hw.laptop);
    }

    #[test]
    fn single_items_and_missing_parts_still_parse() {
        // One GPU, one stick (PowerShell prints them as bare objects), no disk, no OS.
        let json = r#"{"cpu":{"name":"X"},"gpus":{"name":"iGPU"},"ram":{"bytes":8589934592},"systemDisk":null,"laptop":true,"onBattery":true}"#;
        let hw = parse(json).unwrap();
        assert_eq!(hw.gpus.len(), 1);
        assert_eq!(hw.ram.len(), 1);
        assert!(hw.system_disk.is_none());
        assert!(hw.laptop && hw.on_battery);
        assert_eq!(hw.os, Os::default());
    }

    #[test]
    fn laptop_means_a_portable_chassis_only() {
        assert!(SCRIPT.contains("-in 8, 9, 10, 11, 14, 30, 31, 32 }"));
        assert!(!SCRIPT.contains(" 18, 21,"), "expansion and peripheral chassis are not laptops");
    }

    #[test]
    fn garbage_is_an_error_not_a_panic() {
        assert!(parse("").is_err());
        assert!(parse("Get-CimInstance : Access denied").is_err());
    }

    /// Real report from this PC as JSON, for UI checks outside Tauri (read-only):
    /// cargo test dump_hardware_json -- --ignored --nocapture
    #[test]
    #[ignore]
    fn dump_hardware_json() {
        let out = run_hidden_powershell(SCRIPT).unwrap();
        let hw = parse(&out).unwrap();
        println!("HARDWARE_JSON={}", serde_json::to_string(&hw).unwrap());
    }
}
