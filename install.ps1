# Segatt Tools: downloads the latest installer from GitHub Releases, checks it
# against the SHA-256 GitHub publishes for it, and runs it.
#
#   irm https://raw.githubusercontent.com/joshsegatt/Segatt-Tools/main/install.ps1 | iex

# A script block, so nothing here (preferences, variables) stays in your session after `iex`.
& {
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $release = Invoke-RestMethod 'https://api.github.com/repos/joshsegatt/Segatt-Tools/releases/latest'
    $asset = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
    if (-not $asset) { throw "Release $($release.tag_name) has no Windows installer." }

    $file = Join-Path $env:TEMP $asset.name
    Write-Host "Downloading Segatt Tools $($release.tag_name)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing

    # Run only the exact file the release published.
    if ($asset.digest -notlike 'sha256:*') { Remove-Item $file; throw 'The release does not publish a checksum for the installer.' }
    $want = $asset.digest.Substring(7)
    $got = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $want) { Remove-Item $file; throw 'The download does not match the release checksum. Nothing was installed.' }

    Write-Host 'Checksum OK. Starting the installer...'
    Start-Process -FilePath $file -Wait
    Remove-Item $file -ErrorAction SilentlyContinue
}
