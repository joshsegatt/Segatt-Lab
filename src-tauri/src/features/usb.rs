//! Bootable USB drives. A Windows 10/11 ISO is copied to a GPT FAT32 drive
//! (install.wim split with DISM when it is over 4 GB, the FAT32 file limit);
//! a hybrid Linux ISO is written byte for byte, like dd.
//!
//! Safety, in order: only USB disks that are neither the boot nor the system
//! disk are listed; every check that can fail runs before anything is erased;
//! right before erasing, the disk is found again by number, serial and size;
//! the ISO may not live on the drive being erased; everything written is read
//! back from the drive and compared.

use crate::features::utils::{ps_quote, run_hidden_powershell, silent_cmd};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// FAT32 cannot hold a file of 4 GiB or more.
pub const FAT32_MAX_FILE: u64 = 4 * 1024 * 1024 * 1024 - 1;
/// Windows formats FAT32 up to 32 GB; a Windows installer needs far less.
const FAT32_MAX_PARTITION: u64 = 32_000 * 1024 * 1024;
/// GPT tables and the Microsoft reserved partition Initialize-Disk adds.
const GPT_OVERHEAD: u64 = 300 * 1024 * 1024;
/// Free room kept on top of the files: directories and cluster slack.
const COPY_SLACK: u64 = 128 * 1024 * 1024;
const CHUNK: usize = 4 * 1024 * 1024;
/// Sector alignment for unbuffered I/O; a multiple of 512 and 4096 sectors.
const ALIGN: usize = 4096;
const FILE_FLAG_NO_BUFFERING: u32 = 0x2000_0000;
const FILE_FLAG_WRITE_THROUGH: u32 = 0x8000_0000;

/// Error codes the screen turns into sentences; anything else is shown raw.
pub const ERR_BUSY: &str = "USB_BUSY";
pub const ERR_CHANGED: &str = "USB_CHANGED";
pub const ERR_CANCELLED: &str = "USB_CANCELLED";
pub const ERR_ISO_ON_TARGET: &str = "USB_ISO_ON_TARGET";
pub const ERR_UNSUPPORTED: &str = "USB_UNSUPPORTED";
pub const ERR_NOT_ISO: &str = "USB_NOT_ISO";
pub const ERR_TOO_SMALL: &str = "USB_TOO_SMALL";
pub const ERR_ESD_TOO_BIG: &str = "USB_ESD_TOO_BIG";
pub const ERR_VERIFY: &str = "USB_VERIFY_FAILED";

static BUSY: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------- disks

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
pub struct Volume {
    pub letter: String,
    pub label: String,
}

/// One row of Get-Disk, as the listing script prints it.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RawDisk {
    pub number: u32,
    pub name: String,
    #[serde(default)]
    pub serial: String,
    pub size: u64,
    pub bus: String,
    pub boot: bool,
    pub system: bool,
    pub read_only: bool,
    pub offline: bool,
    pub removable: bool,
    #[serde(default)]
    pub volumes: Vec<Volume>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UsbDisk {
    pub number: u32,
    pub name: String,
    pub serial: String,
    pub size: u64,
    /// False for USB hard drives and SSDs: the screen says so.
    pub removable: bool,
    pub volumes: Vec<Volume>,
}

/// A disk may be offered only when it is on USB and Windows does not run or
/// boot from it. Read-only or offline disks could not be written anyway.
pub fn usable(d: &RawDisk) -> bool {
    d.bus.eq_ignore_ascii_case("USB") && !d.boot && !d.system && !d.read_only && !d.offline && d.size > 0
}

const LIST_DISKS: &str = r#"
$removable = @{}
Get-CimInstance Win32_DiskDrive | ForEach-Object { $removable[[int]$_.Index] = ([string]$_.MediaType -like 'Removable*') }
$rows = @(Get-Disk | ForEach-Object {
    $n = [int]$_.Number
    $vols = @(Get-Partition -DiskNumber $n -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object {
        $v = $_ | Get-Volume -ErrorAction SilentlyContinue
        [pscustomobject]@{ letter = [string]$_.DriveLetter; label = [string]$v.FileSystemLabel }
    })
    [pscustomobject]@{
        number = $n; name = [string]$_.FriendlyName; serial = ([string]$_.SerialNumber).Trim(); size = [uint64]$_.Size
        bus = [string]$_.BusType; boot = [bool]$_.IsBoot; system = [bool]$_.IsSystem
        readOnly = [bool]$_.IsReadOnly; offline = [bool]$_.IsOffline; removable = [bool]$removable[$n]; volumes = $vols
    }
})
ConvertTo-Json -InputObject $rows -Depth 4 -Compress
"#;

fn read_disks() -> Result<Vec<RawDisk>, String> {
    let out = run_hidden_powershell(LIST_DISKS)?;
    serde_json::from_str(&out).map_err(|e| format!("Could not read the disks: {e}"))
}

fn to_usb(d: RawDisk) -> UsbDisk {
    UsbDisk { number: d.number, name: d.name, serial: d.serial, size: d.size, removable: d.removable, volumes: d.volumes }
}

#[tauri::command]
pub async fn list_usb_disks() -> Result<Vec<UsbDisk>, String> {
    let disks = tauri::async_runtime::spawn_blocking(read_disks).await.map_err(|e| format!("Runtime error: {e}"))??;
    Ok(disks.into_iter().filter(usable).map(to_usb).collect())
}

/// The disk the user confirmed, found again: same number, serial and size, and
/// still a USB disk Windows does not run from. Anything else means the drive
/// was swapped since the list was read.
pub fn find_again(disks: Vec<RawDisk>, number: u32, serial: &str, size: u64) -> Result<RawDisk, String> {
    disks
        .into_iter()
        .find(|d| d.number == number && d.serial == serial && d.size == size && usable(d))
        .ok_or_else(|| ERR_CHANGED.to_string())
}

// ---------------------------------------------------------------- ISO

#[derive(Debug, PartialEq)]
pub struct IsoHeader {
    pub label: String,
    /// An MBR boot signature: the image boots when written as is (isohybrid).
    pub hybrid: bool,
}

/// Reads the first 34 KB: the MBR signature at 510 and the volume descriptor
/// at 32 KB, ISO 9660 ("CD001") or UDF ("BEA01").
pub fn parse_header(bytes: &[u8]) -> Result<IsoHeader, String> {
    let desc = bytes.get(0x8001..0x8006).ok_or(ERR_NOT_ISO)?;
    if desc != b"CD001" && desc != b"BEA01" {
        return Err(ERR_NOT_ISO.into());
    }
    let label = if desc == b"CD001" {
        String::from_utf8_lossy(&bytes[0x8028..0x8048]).trim_matches(|c: char| c == ' ' || c == '\0').to_string()
    } else {
        String::new()
    };
    Ok(IsoHeader { label, hybrid: bytes[510] == 0x55 && bytes[511] == 0xAA })
}

fn read_header(path: &Path) -> Result<IsoHeader, String> {
    let mut buf = vec![0u8; 0x8800];
    let mut f = File::open(path).map_err(|e| format!("Could not open the ISO: {e}"))?;
    let n = fill(&mut f, &mut buf).map_err(|e| format!("Could not read the ISO: {e}"))?;
    buf.truncate(n);
    parse_header(&buf)
}

/// Only an existing file named *.iso is accepted, by its full path.
fn iso_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let is_iso = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("iso"));
    if !is_iso || !p.is_file() {
        return Err(ERR_NOT_ISO.into());
    }
    std::fs::canonicalize(p).map_err(|e| format!("Could not open the ISO: {e}"))
}

/// The drive letter a path lives on, if it has one (`\\?\D:\x.iso` → D).
pub fn drive_letter(path: &Path) -> Option<char> {
    let s = path.to_string_lossy();
    let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
    let mut chars = s.chars();
    match (chars.next(), chars.next()) {
        (Some(c), Some(':')) if c.is_ascii_alphabetic() => Some(c.to_ascii_uppercase()),
        _ => None,
    }
}

pub fn iso_on_disk(iso: &Path, disk: &RawDisk) -> bool {
    drive_letter(iso).is_some_and(|l| disk.volumes.iter().any(|v| v.letter.eq_ignore_ascii_case(&l.to_string())))
}

/// A mounted ISO, dismounted on drop unless it was mounted before we came.
struct Mounted {
    iso: PathBuf,
    root: PathBuf,
    ours: bool,
}

impl Mounted {
    fn new(iso: &Path) -> Result<Self, String> {
        let q = ps_quote(&iso.to_string_lossy());
        let script = format!(
            r#"$iso = {q}
$ours = -not (Get-DiskImage -ImagePath $iso).Attached
if ($ours) {{ Mount-DiskImage -ImagePath $iso -StorageType ISO | Out-Null }}
$letter = ''
for ($i = 0; $i -lt 40 -and -not $letter; $i++) {{
    $letter = [string](Get-DiskImage -ImagePath $iso | Get-Volume -ErrorAction SilentlyContinue).DriveLetter
    if (-not $letter) {{ Start-Sleep -Milliseconds 250 }}
}}
if (-not $letter) {{
    if ($ours) {{ Dismount-DiskImage -ImagePath $iso | Out-Null }}
    throw 'The ISO opened without a drive letter.'
}}
ConvertTo-Json -Compress -InputObject ([pscustomobject]@{{ letter = $letter; ours = $ours }})"#
        );
        #[derive(Deserialize)]
        struct Out {
            letter: String,
            ours: bool,
        }
        let out: Out = serde_json::from_str(&run_hidden_powershell(&script)?).map_err(|e| format!("Could not open the ISO: {e}"))?;
        Ok(Mounted { iso: iso.to_path_buf(), root: PathBuf::from(format!("{}:\\", out.letter)), ours: out.ours })
    }
}

impl Drop for Mounted {
    fn drop(&mut self) {
        if self.ours {
            let q = ps_quote(&self.iso.to_string_lossy());
            let _ = run_hidden_powershell(&format!("Dismount-DiskImage -ImagePath {q} | Out-Null"));
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IsoInfo {
    /// "windows" (files copied to FAT32) or "linux" (written byte for byte).
    pub kind: &'static str,
    pub name: String,
    pub label: String,
    pub size: u64,
    /// install.wim is over 4 GB and will be split.
    pub splits: bool,
}

/// What a mounted Windows ISO holds, by relative path and size.
struct WinFiles {
    files: Vec<(PathBuf, u64)>,
    wim: Option<u64>,
}

impl WinFiles {
    fn total(&self) -> u64 {
        self.files.iter().map(|(_, n)| n).sum()
    }
}

fn list_files(root: &Path) -> Result<Vec<(PathBuf, u64)>, String> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<(PathBuf, u64)>) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let meta = entry.metadata()?;
            let path = entry.path();
            if meta.is_dir() {
                walk(root, &path, out)?;
            } else if meta.is_file() {
                out.push((path.strip_prefix(root).unwrap_or(&path).to_path_buf(), meta.len()));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(root, root, &mut out).map_err(|e| format!("Could not read the ISO: {e}"))?;
    Ok(out)
}

/// A Windows 10/11 installer has install.wim or install.esd and a UEFI loader.
fn windows_files(root: &Path) -> Result<Option<WinFiles>, String> {
    let has = |rel: &str| root.join(rel).is_file();
    let image = has(r"sources\install.wim") || has(r"sources\install.esd");
    let uefi = has(r"efi\boot\bootx64.efi") || has(r"efi\boot\bootaa64.efi");
    if !image || !uefi {
        return Ok(None);
    }
    let files = list_files(root)?;
    let wim = files.iter().find(|(p, _)| is_wim(p)).map(|(_, n)| *n);
    if let Some((_, n)) = files.iter().find(|(p, _)| p.as_os_str().eq_ignore_ascii_case(r"sources\install.esd")) {
        if *n > FAT32_MAX_FILE {
            return Err(ERR_ESD_TOO_BIG.into());
        }
    }
    Ok(Some(WinFiles { files, wim }))
}

fn is_wim(rel: &Path) -> bool {
    rel.as_os_str().eq_ignore_ascii_case(r"sources\install.wim")
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn inspect(iso: &Path) -> Result<IsoInfo, String> {
    let header = read_header(iso)?;
    let size = std::fs::metadata(iso).map_err(|e| e.to_string())?.len();
    let name = file_name(iso);
    // Windows installers are never hybrid; a hybrid image is written as is.
    if header.hybrid {
        return Ok(IsoInfo { kind: "linux", name, label: header.label, size, splits: false });
    }
    let mounted = Mounted::new(iso)?;
    match windows_files(&mounted.root)? {
        Some(w) => Ok(IsoInfo { kind: "windows", name, label: header.label, size, splits: w.wim.is_some_and(|n| n > FAT32_MAX_FILE) }),
        None => Err(ERR_UNSUPPORTED.into()),
    }
}

#[tauri::command]
pub async fn inspect_iso(path: String) -> Result<IsoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(&iso_path(&path)?))
        .await
        .map_err(|e| format!("Runtime error: {e}"))?
}

// ---------------------------------------------------------------- unattend

/// Windows local account names: 1 to 20 characters, none of the reserved ones.
pub fn valid_account(name: &str) -> bool {
    let n = name.trim();
    !n.is_empty()
        && n == name
        && n.chars().count() <= 20
        && !n.ends_with('.')
        && !n.chars().any(|c| c.is_control() || "\"/\\[]:;|=,+*?<>@%".contains(c))
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// autounattend.xml at the drive root. It never configures disks: Setup still
/// asks where to install. `hardware` skips the TPM, Secure Boot and RAM checks;
/// `account` creates that local administrator so no Microsoft account is asked
/// (no password; Windows asks for one at the second sign-in).
pub fn unattend(hardware: bool, account: Option<&str>) -> String {
    const COMPONENT: &str = r#"processorArchitecture="ARCH" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS""#;
    let per_arch = |name: &str, body: &str| -> String {
        ["amd64", "arm64"]
            .iter()
            .map(|a| format!("    <component name=\"{name}\" {}>\n{body}    </component>\n", COMPONENT.replace("ARCH", a)))
            .collect()
    };
    let run = |cmds: &[String], tag: &str, inner: &str| -> String {
        cmds.iter()
            .enumerate()
            .map(|(i, c)| format!("          <{inner} wcm:action=\"add\"><Order>{}</Order><{tag}>{}</{tag}></{inner}>\n", i + 1, xml_escape(c)))
            .collect()
    };
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<unattend xmlns=\"urn:schemas-microsoft-com:unattend\" xmlns:wcm=\"http://schemas.microsoft.com/WMIConfig/2002/State\">\n",
    );
    if hardware {
        let cmds: Vec<String> = ["BypassTPMCheck", "BypassSecureBootCheck", "BypassRAMCheck"]
            .iter()
            .map(|v| format!(r"reg add HKLM\SYSTEM\Setup\LabConfig /v {v} /t REG_DWORD /d 1 /f"))
            .collect();
        let body = format!("      <RunSynchronous>\n{}      </RunSynchronous>\n", run(&cmds, "Path", "RunSynchronousCommand"));
        out += &format!("  <settings pass=\"windowsPE\">\n{}  </settings>\n", per_arch("Microsoft-Windows-Setup", &body));
    }
    if let Some(name) = account {
        let nro = vec![r"reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\OOBE /v BypassNRO /t REG_DWORD /d 1 /f".to_string()];
        let body = format!("      <RunSynchronous>\n{}      </RunSynchronous>\n", run(&nro, "Path", "RunSynchronousCommand"));
        out += &format!("  <settings pass=\"specialize\">\n{}  </settings>\n", per_arch("Microsoft-Windows-Deployment", &body));

        let n = xml_escape(name);
        let first = vec![format!("net user \"{name}\" /logonpasswordchg:yes"), "net accounts /maxpwage:unlimited".to_string()];
        let body = format!(
            "      <AutoLogon>\n        <Password><Value></Value><PlainText>true</PlainText></Password>\n        <Enabled>true</Enabled>\n        <LogonCount>1</LogonCount>\n        <Username>{n}</Username>\n      </AutoLogon>\n\
      <FirstLogonCommands>\n{}      </FirstLogonCommands>\n\
      <OOBE>\n        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>\n        <HideLocalAccountScreen>true</HideLocalAccountScreen>\n      </OOBE>\n\
      <UserAccounts>\n        <LocalAccounts>\n          <LocalAccount wcm:action=\"add\">\n            <Name>{n}</Name>\n            <Group>Administrators</Group>\n            <Password><Value></Value><PlainText>true</PlainText></Password>\n          </LocalAccount>\n        </LocalAccounts>\n      </UserAccounts>\n",
            run(&first, "CommandLine", "SynchronousCommand")
        );
        out += &format!("  <settings pass=\"oobeSystem\">\n{}  </settings>\n", per_arch("Microsoft-Windows-Shell-Setup", &body));
    }
    out + "</unattend>\n"
}

// ---------------------------------------------------------------- writing

#[derive(Serialize, Clone, Debug)]
pub struct Progress {
    /// "erase", "copy", "split", "verify".
    pub stage: &'static str,
    pub done: u64,
    pub total: u64,
}

/// Sends progress at most every 200 ms, and always the last value.
struct Reporter<'a> {
    channel: &'a dyn Fn(Progress),
    last: Instant,
}

impl<'a> Reporter<'a> {
    fn new(channel: &'a dyn Fn(Progress)) -> Self {
        Reporter { channel, last: Instant::now() - Duration::from_secs(1) }
    }
    fn send(&mut self, stage: &'static str, done: u64, total: u64) {
        if done >= total || self.last.elapsed() >= Duration::from_millis(200) {
            self.last = Instant::now();
            (self.channel)(Progress { stage, done, total });
        }
    }
}

fn cancelled() -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        Err(ERR_CANCELLED.into())
    } else {
        Ok(())
    }
}

/// A buffer aligned to the sector size, as unbuffered I/O requires.
struct Aligned {
    buf: Vec<u8>,
    off: usize,
}

impl Aligned {
    fn new() -> Self {
        let buf = vec![0u8; CHUNK + ALIGN];
        let off = buf.as_ptr().align_offset(ALIGN);
        Aligned { buf, off }
    }
    fn slice(&mut self) -> &mut [u8] {
        &mut self.buf[self.off..self.off + CHUNK]
    }
}

/// Reads until the buffer is full or the end of the file.
fn fill(r: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(n)
}

/// One read from an unbuffered handle. It must not be looped like `fill`: a
/// second read into the rest of the buffer is unaligned and Windows refuses it.
fn read_once(f: &mut File, buf: &mut [u8]) -> std::io::Result<usize> {
    loop {
        match f.read(buf) {
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            other => return other,
        }
    }
}

fn unbuffered(path: &Path, write: bool) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    let flags = FILE_FLAG_NO_BUFFERING | if write { FILE_FLAG_WRITE_THROUGH } else { 0 };
    OpenOptions::new().read(true).write(write).custom_flags(flags).open(path)
}

/// Writes `src` to the start of `dst` (a disk or an existing file) without the
/// cache, the last block padded with zeros to the sector size.
pub fn write_image(src: &Path, dst: &Path, mut on_bytes: impl FnMut(u64)) -> Result<u64, String> {
    let mut input = File::open(src).map_err(|e| format!("Could not open the ISO: {e}"))?;
    let mut output = unbuffered(dst, true).map_err(|e| format!("Could not open the drive: {e}"))?;
    let mut buf = Aligned::new();
    let mut done = 0u64;
    loop {
        cancelled()?;
        let n = fill(&mut input, buf.slice()).map_err(|e| format!("Could not read the ISO: {e}"))?;
        if n == 0 {
            break;
        }
        let padded = n.div_ceil(ALIGN) * ALIGN;
        buf.slice()[n..padded].fill(0);
        output.write_all(&buf.slice()[..padded]).map_err(|e| format!("Writing to the drive failed: {e}"))?;
        done += n as u64;
        on_bytes(done);
        if n < CHUNK {
            break;
        }
    }
    output.flush().map_err(|e| format!("Writing to the drive failed: {e}"))?;
    Ok(done)
}

/// Reads `len` bytes back from `dst` without the cache and compares them with
/// `src`. Any difference is a failed write.
pub fn verify_image(src: &Path, dst: &Path, len: u64, mut on_bytes: impl FnMut(u64)) -> Result<(), String> {
    let mut input = File::open(src).map_err(|e| format!("Could not open the ISO: {e}"))?;
    let mut written = unbuffered(dst, false).map_err(|e| format!("Could not read the drive back: {e}"))?;
    let mut want = vec![0u8; CHUNK];
    let mut got = Aligned::new();
    let mut done = 0u64;
    while done < len {
        cancelled()?;
        let n = fill(&mut input, &mut want).map_err(|e| format!("Could not read the ISO: {e}"))?;
        let k = read_once(&mut written, got.slice()).map_err(|e| format!("Could not read the drive back: {e}"))?;
        if n == 0 || k < n || want[..n] != got.slice()[..n] {
            return Err(ERR_VERIFY.into());
        }
        done += n as u64;
        on_bytes(done);
    }
    Ok(())
}

/// Copies one file in chunks, so progress moves and Cancel works mid-file.
fn copy_file(src: &Path, dst: &Path, mut on_bytes: impl FnMut(u64)) -> Result<(), String> {
    let mut input = File::open(src).map_err(|e| format!("Could not read {}: {e}", src.display()))?;
    let mut output = File::create(dst).map_err(|e| format!("Could not write {}: {e}", dst.display()))?;
    let mut buf = vec![0u8; CHUNK];
    loop {
        cancelled()?;
        let n = fill(&mut input, &mut buf).map_err(|e| format!("Could not read {}: {e}", src.display()))?;
        if n == 0 {
            break;
        }
        output.write_all(&buf[..n]).map_err(|e| format!("Could not write {}: {e}", dst.display()))?;
        on_bytes(n as u64);
    }
    Ok(())
}

/// Compares a copied file with its source, reading the copy without the cache.
fn same_file(src: &Path, dst: &Path, mut on_bytes: impl FnMut(u64)) -> Result<(), String> {
    let mut a = File::open(src).map_err(|e| format!("Could not read {}: {e}", src.display()))?;
    let mut b = unbuffered(dst, false).map_err(|e| format!("Could not read {} back: {e}", dst.display()))?;
    let mut want = vec![0u8; CHUNK];
    let mut got = Aligned::new();
    loop {
        cancelled()?;
        let n = fill(&mut a, &mut want).map_err(|e| e.to_string())?;
        let k = read_once(&mut b, got.slice()).map_err(|e| e.to_string())?;
        if n != k || want[..n] != got.slice()[..n] {
            return Err(ERR_VERIFY.into());
        }
        on_bytes(n as u64);
        // Both ended together: a short read is the end of the file.
        if n < CHUNK {
            return Ok(());
        }
    }
}

/// Erases the disk and leaves one GPT FAT32 partition; returns its root.
/// The script checks the disk once more on its own before touching it.
fn prepare_fat32(disk: &RawDisk) -> Result<PathBuf, String> {
    let serial = ps_quote(&disk.serial);
    let script = format!(
        r#"$n = {n}
$d = Get-Disk -Number $n
if ($d.BusType -ne 'USB' -or $d.IsBoot -or $d.IsSystem -or ([string]$d.SerialNumber).Trim() -ne {serial} -or [uint64]$d.Size -ne {size}) {{ throw '{changed}' }}
if ($d.PartitionStyle -ne 'RAW') {{ Clear-Disk -Number $n -RemoveData -RemoveOEM -Confirm:$false }}
Initialize-Disk -Number $n -PartitionStyle GPT
$free = [uint64](Get-Disk -Number $n).LargestFreeExtent
$size = [Math]::Min($free, [uint64]{max})
$p = New-Partition -DiskNumber $n -Size $size -AssignDriveLetter
Format-Volume -Partition $p -FileSystem FAT32 -NewFileSystemLabel 'WINDOWS' -Confirm:$false -Force | Out-Null
$p = Get-Partition -DiskNumber $n -PartitionNumber $p.PartitionNumber
if (-not $p.DriveLetter) {{ $p | Add-PartitionAccessPath -AssignDriveLetter; $p = Get-Partition -DiskNumber $n -PartitionNumber $p.PartitionNumber }}
[string]$p.DriveLetter"#,
        n = disk.number,
        size = disk.size,
        max = FAT32_MAX_PARTITION,
        changed = ERR_CHANGED,
    );
    let letter = run_hidden_powershell(&script).map_err(|e| if e.contains(ERR_CHANGED) { ERR_CHANGED.into() } else { e })?;
    let letter = letter.trim();
    if letter.len() != 1 {
        return Err("The new partition got no drive letter.".into());
    }
    Ok(PathBuf::from(format!("{letter}:\\")))
}

/// Erases the partition table so no volume holds sectors of the disk while
/// it is written raw.
fn clear_disk(disk: &RawDisk) -> Result<(), String> {
    let serial = ps_quote(&disk.serial);
    let script = format!(
        r#"$n = {n}
$d = Get-Disk -Number $n
if ($d.BusType -ne 'USB' -or $d.IsBoot -or $d.IsSystem -or ([string]$d.SerialNumber).Trim() -ne {serial} -or [uint64]$d.Size -ne {size}) {{ throw '{changed}' }}
if ($d.PartitionStyle -ne 'RAW') {{ Clear-Disk -Number $n -RemoveData -RemoveOEM -Confirm:$false }}"#,
        n = disk.number,
        size = disk.size,
        changed = ERR_CHANGED,
    );
    run_hidden_powershell(&script).map(|_| ()).map_err(|e| if e.contains(ERR_CHANGED) { ERR_CHANGED.into() } else { e })
}

/// Splits install.wim into install.swm parts under 4 GB, reporting the bytes
/// DISM has written so far.
fn split_wim(src: &Path, dst_sources: &Path, mut on_bytes: impl FnMut(u64)) -> Result<(), String> {
    let image = format!("/ImageFile:{}", src.display());
    let swm = format!("/SWMFile:{}", dst_sources.join("install.swm").display());
    let mut child = silent_cmd("dism")
        .args(["/English", "/Split-Image", &image, &swm, "/FileSize:3800", "/CheckIntegrity"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start DISM: {e}"))?;
    let written = || -> u64 {
        std::fs::read_dir(dst_sources)
            .map(|it| {
                it.flatten()
                    .filter(|e| e.file_name().to_string_lossy().to_ascii_lowercase().starts_with("install") && e.file_name().to_string_lossy().to_ascii_lowercase().ends_with(".swm"))
                    .filter_map(|e| e.metadata().ok())
                    .map(|m| m.len())
                    .sum()
            })
            .unwrap_or(0)
    };
    loop {
        if CANCEL.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(ERR_CANCELLED.into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if status.success() {
                on_bytes(written());
                return Ok(());
            }
            let mut out = String::new();
            if let Some(mut s) = child.stdout.take() {
                let _ = s.read_to_string(&mut out);
            }
            let tail: Vec<&str> = out.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            return Err(format!("DISM could not split install.wim: {}", tail.iter().rev().take(2).rev().cloned().collect::<Vec<_>>().join(" ")));
        }
        on_bytes(written());
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn flush_volume(root: &Path) {
    if let Some(l) = drive_letter(root) {
        let _ = run_hidden_powershell(&format!("Write-VolumeCache -DriveLetter {l}"));
    }
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WinOptions {
    pub skip_hardware_checks: bool,
    pub local_account: Option<String>,
}

fn write_windows(iso: &Path, disk: &RawDisk, opts: &WinOptions, report: &mut Reporter) -> Result<(), String> {
    let account = match opts.local_account.as_deref() {
        Some(name) if !valid_account(name) => return Err("Invalid local account name.".into()),
        other => other,
    };
    let mounted = Mounted::new(iso)?;
    let files = windows_files(&mounted.root)?.ok_or(ERR_UNSUPPORTED)?;
    let needed = files.total();
    let room = disk.size.saturating_sub(GPT_OVERHEAD).min(FAT32_MAX_PARTITION);
    if needed + COPY_SLACK > room {
        return Err(format!("{ERR_TOO_SMALL}:{}", needed + COPY_SLACK + GPT_OVERHEAD));
    }
    let split = files.wim.is_some_and(|n| n > FAT32_MAX_FILE);

    // From here on the drive is erased.
    report.send("erase", 0, 1);
    let root = prepare_fat32(disk)?;
    report.send("erase", 1, 1);

    let mut done = 0u64;
    for (rel, _) in &files.files {
        if split && is_wim(rel) {
            continue;
        }
        let dst = root.join(rel);
        if let Some(dir) = dst.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Could not write {}: {e}", dir.display()))?;
        }
        copy_file(&mounted.root.join(rel), &dst, |n| {
            done += n;
            report.send("copy", done, needed);
        })?;
    }
    if split {
        let base = done;
        let src = mounted.root.join(r"sources\install.wim");
        split_wim(&src, &root.join("sources"), |n| report.send("split", (base + n).min(needed), needed))?;
    }
    if account.is_some() || opts.skip_hardware_checks {
        std::fs::write(root.join("autounattend.xml"), unattend(opts.skip_hardware_checks, account))
            .map_err(|e| format!("Could not write autounattend.xml: {e}"))?;
    }
    flush_volume(&root);

    // Read everything back from the drive. The split parts were checked by
    // DISM (/CheckIntegrity) as it wrote them.
    let to_check: u64 = files.files.iter().filter(|(p, _)| !(split && is_wim(p))).map(|(_, n)| n).sum();
    let mut checked = 0u64;
    for (rel, _) in files.files.iter().filter(|(p, _)| !(split && is_wim(p))) {
        same_file(&mounted.root.join(rel), &root.join(rel), |n| {
            checked += n;
            report.send("verify", checked, to_check);
        })?;
    }
    report.send("verify", to_check, to_check);
    Ok(())
}

fn write_linux(iso: &Path, disk: &RawDisk, report: &mut Reporter) -> Result<(), String> {
    let size = std::fs::metadata(iso).map_err(|e| e.to_string())?.len();
    // Read-back goes in whole chunks, so the last one must fit on the disk too.
    if size.div_ceil(CHUNK as u64) * CHUNK as u64 > disk.size {
        return Err(format!("{ERR_TOO_SMALL}:{size}"));
    }
    report.send("erase", 0, 1);
    clear_disk(disk)?;
    report.send("erase", 1, 1);
    let device = PathBuf::from(format!(r"\\.\PhysicalDrive{}", disk.number));
    write_image(iso, &device, |n| report.send("copy", n, size))?;
    verify_image(iso, &device, size, |n| report.send("verify", n, size))?;
    // Let Windows see the new partitions.
    let _ = run_hidden_powershell(&format!("Update-Disk -Number {}", disk.number));
    Ok(())
}

struct BusyGuard;

impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

fn write(disk: u32, serial: &str, size: u64, iso: &str, opts: &WinOptions, channel: &dyn Fn(Progress)) -> Result<(), String> {
    let iso = iso_path(iso)?;
    let target = find_again(read_disks()?, disk, serial, size)?;
    if iso_on_disk(&iso, &target) {
        return Err(ERR_ISO_ON_TARGET.into());
    }
    let mut report = Reporter::new(channel);
    let header = read_header(&iso)?;
    if header.hybrid {
        write_linux(&iso, &target, &mut report)
    } else {
        write_windows(&iso, &target, opts, &mut report)
    }
}

/// Erases the confirmed disk and makes it bootable from the ISO. One at a time.
#[tauri::command]
pub async fn write_usb(disk: u32, serial: String, size: u64, iso: String, options: WinOptions, on_progress: Channel<Progress>) -> Result<(), String> {
    if BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err(ERR_BUSY.into());
    }
    let guard = BusyGuard;
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let send = |p: Progress| {
            let _ = on_progress.send(p);
        };
        write(disk, &serial, size, &iso, &options, &send)
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
}

#[tauri::command]
pub fn cancel_usb() {
    CANCEL.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disk(number: u32, bus: &str, boot: bool, system: bool) -> RawDisk {
        RawDisk {
            number,
            name: "SanDisk Cruzer".into(),
            serial: "4C53".into(),
            size: 32_000_000_000,
            bus: bus.into(),
            boot,
            system,
            read_only: false,
            offline: false,
            removable: true,
            volumes: vec![Volume { letter: "E".into(), label: "USB".into() }],
        }
    }

    #[test]
    fn only_usb_disks_windows_does_not_run_from() {
        assert!(usable(&disk(1, "USB", false, false)));
        assert!(!usable(&disk(0, "NVMe", false, false)), "internal disk");
        assert!(!usable(&disk(0, "SATA", true, true)), "system disk");
        assert!(!usable(&disk(1, "USB", true, false)), "booted from this USB");
        assert!(!usable(&disk(1, "USB", false, true)), "Windows To Go");
        assert!(!usable(&RawDisk { read_only: true, ..disk(1, "USB", false, false) }));
        assert!(!usable(&RawDisk { offline: true, ..disk(1, "USB", false, false) }));
        assert!(!usable(&RawDisk { size: 0, ..disk(1, "USB", false, false) }), "card reader with no card");
    }

    #[test]
    fn the_disk_must_be_the_same_one_the_user_confirmed() {
        let list = || vec![disk(0, "NVMe", true, true), disk(2, "USB", false, false)];
        assert_eq!(find_again(list(), 2, "4C53", 32_000_000_000).unwrap().number, 2);
        assert_eq!(find_again(list(), 2, "OTHER", 32_000_000_000).unwrap_err(), ERR_CHANGED, "another stick on the same number");
        assert_eq!(find_again(list(), 2, "4C53", 16_000_000_000).unwrap_err(), ERR_CHANGED);
        assert_eq!(find_again(list(), 3, "4C53", 32_000_000_000).unwrap_err(), ERR_CHANGED, "unplugged");
        let sys = RawDisk { serial: "4C53".into(), size: 32_000_000_000, ..disk(0, "NVMe", true, true) };
        assert_eq!(find_again(vec![sys], 0, "4C53", 32_000_000_000).unwrap_err(), ERR_CHANGED, "never the system disk");
    }

    #[test]
    fn the_disk_list_script_output_parses() {
        let json = r#"[{"number":1,"name":"Kingston DataTraveler 3.0","serial":"E0D55E6","size":30943995904,"bus":"USB","boot":false,"system":false,"readOnly":false,"offline":false,"removable":true,"volumes":[{"letter":"E","label":"KINGSTON"}]},{"number":0,"name":"Samsung SSD 990 PRO 2TB","serial":"S6Z2","size":2000398934016,"bus":"NVMe","boot":true,"system":true,"readOnly":false,"offline":false,"removable":false,"volumes":[]}]"#;
        let disks: Vec<RawDisk> = serde_json::from_str(json).unwrap();
        let usb: Vec<UsbDisk> = disks.into_iter().filter(usable).map(to_usb).collect();
        assert_eq!(usb.len(), 1);
        assert_eq!(usb[0].volumes, vec![Volume { letter: "E".into(), label: "KINGSTON".into() }]);
    }

    #[test]
    fn the_iso_may_not_live_on_the_drive_being_erased() {
        let usb = disk(1, "USB", false, false);
        assert_eq!(drive_letter(Path::new(r"\\?\E:\Win11.iso")), Some('E'));
        assert_eq!(drive_letter(Path::new(r"e:\Win11.iso")), Some('E'));
        assert_eq!(drive_letter(Path::new(r"\\?\UNC\nas\isos\x.iso")), None);
        assert!(iso_on_disk(Path::new(r"\\?\E:\Win11.iso"), &usb));
        assert!(!iso_on_disk(Path::new(r"\\?\C:\Users\x\Downloads\Win11.iso"), &usb));
    }

    fn header(cd: &[u8; 5], label: &str, mbr: bool) -> Vec<u8> {
        let mut b = vec![0u8; 0x8800];
        b[0x8001..0x8006].copy_from_slice(cd);
        b[0x8028..0x8028 + label.len()].copy_from_slice(label.as_bytes());
        if mbr {
            b[510] = 0x55;
            b[511] = 0xAA;
        }
        b
    }

    #[test]
    fn tells_a_hybrid_linux_image_from_a_windows_one() {
        assert_eq!(parse_header(&header(b"CD001", "Ubuntu 24.04 LTS amd64", true)).unwrap(), IsoHeader { label: "Ubuntu 24.04 LTS amd64".into(), hybrid: true });
        assert_eq!(parse_header(&header(b"CD001", "CCCOMA_X64FRE_EN-US_DV9", false)).unwrap(), IsoHeader { label: "CCCOMA_X64FRE_EN-US_DV9".into(), hybrid: false });
        assert!(!parse_header(&header(b"BEA01", "", false)).unwrap().hybrid, "UDF only");
        assert_eq!(parse_header(&header(b"NOTIS", "", false)).unwrap_err(), ERR_NOT_ISO);
        assert_eq!(parse_header(&[0u8; 100]).unwrap_err(), ERR_NOT_ISO, "too short");
    }

    #[test]
    fn local_account_names_follow_windows_rules() {
        for ok in ["Josh", "Player 1", "joão", "a.b-c_d"] {
            assert!(valid_account(ok), "{ok}");
        }
        for bad in ["", " ", " Josh", "Josh ", "a\"b", "a/b", "a\\b", "x@y", "dots.", "abcdefghijklmnopqrstu", "a<b"] {
            assert!(!valid_account(bad), "{bad}");
        }
    }

    #[test]
    fn unattend_never_touches_disks() {
        let both = unattend(true, Some("Player & Co"));
        assert!(both.contains("BypassTPMCheck") && both.contains("BypassSecureBootCheck") && both.contains("BypassRAMCheck"));
        assert!(both.contains("BypassNRO"));
        assert!(both.contains("<Name>Player &amp; Co</Name>"), "escaped");
        assert!(both.contains(r#"net user &quot;Player &amp; Co&quot; /logonpasswordchg:yes"#));
        assert!(both.contains(r#"processorArchitecture="amd64""#) && both.contains(r#"processorArchitecture="arm64""#));
        assert!(!both.contains("DiskConfiguration") && !both.contains("InstallTo"), "Setup must still ask where to install");
        let hw = unattend(true, None);
        assert!(hw.contains("LabConfig") && !hw.contains("LocalAccount") && !hw.contains("BypassNRO"));
        let acc = unattend(false, Some("Player"));
        assert!(!acc.contains("LabConfig") && acc.contains("<Name>Player</Name>"));
    }

    /// Windows' own XML parser accepts every combination.
    #[cfg(windows)]
    #[test]
    fn unattend_is_valid_xml() {
        let dir = std::env::temp_dir().join(format!("segatt-unattend-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for (i, (hw, acc)) in [(true, Some("Player & Co")), (true, None), (false, Some("Joao"))].into_iter().enumerate() {
            let f = dir.join(format!("u{i}.xml"));
            std::fs::write(&f, unattend(hw, acc)).unwrap();
            let script = format!("$x = [xml](Get-Content -Raw -LiteralPath {}); $x.unattend.settings.Count", ps_quote(&f.to_string_lossy()));
            assert!(run_hidden_powershell(&script).is_ok(), "{}", unattend(hw, acc));
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn sample(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i * 31 % 251) as u8).collect()
    }

    /// The raw writer, against a file standing in for the disk.
    #[cfg(windows)]
    #[test]
    fn raw_write_reads_back_the_same_bytes_and_catches_a_bad_one() {
        let dir = std::env::temp_dir().join(format!("segatt-usb-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let iso = dir.join("linux.iso");
        let dev = dir.join("disk.img");
        let len = CHUNK * 2 + 12_345; // two full chunks and a ragged end
        std::fs::write(&iso, sample(len)).unwrap();
        std::fs::write(&dev, vec![0xEEu8; len + 2 * ALIGN]).unwrap();

        let mut seen = 0;
        assert_eq!(write_image(&iso, &dev, |n| seen = n).unwrap(), len as u64);
        assert_eq!(seen, len as u64);
        let disk = std::fs::read(&dev).unwrap();
        assert_eq!(&disk[..len], &sample(len)[..]);
        assert!(disk[len..len.div_ceil(ALIGN) * ALIGN].iter().all(|&b| b == 0), "padding is zeros");
        verify_image(&iso, &dev, len as u64, |_| {}).unwrap();

        // One flipped byte near the end must fail the check.
        let mut bad = disk.clone();
        bad[len - 3] ^= 0xFF;
        std::fs::write(&dev, bad).unwrap();
        assert_eq!(verify_image(&iso, &dev, len as u64, |_| {}).unwrap_err(), ERR_VERIFY);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn copied_files_are_compared_byte_for_byte() {
        let dir = std::env::temp_dir().join(format!("segatt-usb-copy-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (a, b) = (dir.join("boot.wim"), dir.join("copy.wim"));
        std::fs::write(&a, sample(CHUNK + 77)).unwrap();
        let mut copied = 0;
        copy_file(&a, &b, |n| copied += n).unwrap();
        assert_eq!(copied, (CHUNK + 77) as u64);
        same_file(&a, &b, |_| {}).unwrap();
        std::fs::write(&b, sample(CHUNK + 76)).unwrap();
        assert_eq!(same_file(&a, &b, |_| {}).unwrap_err(), ERR_VERIFY, "a short copy fails");
        std::fs::write(&b, vec![0u8; 0]).unwrap();
        assert_eq!(same_file(&a, &b, |_| {}).unwrap_err(), ERR_VERIFY, "an empty copy fails");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Reads a real ISO and lists the USB disks of this PC; erases nothing.
    /// SEGATT_ISO=C:\path\x.iso cargo test dump_usb -- --ignored --nocapture
    #[test]
    #[ignore]
    fn dump_usb() {
        println!("{:#?}", read_disks().map(|d| d.into_iter().filter(usable).map(to_usb).collect::<Vec<_>>()));
        if let Ok(iso) = std::env::var("SEGATT_ISO") {
            println!("{:#?}", iso_path(&iso).and_then(|p| inspect(&p)));
        }
    }

    #[test]
    fn only_wim_files_over_4gb_are_split() {
        assert!(is_wim(Path::new(r"sources\install.wim")));
        assert!(is_wim(Path::new(r"SOURCES\INSTALL.WIM")));
        assert!(!is_wim(Path::new(r"sources\boot.wim")));
    }
}
