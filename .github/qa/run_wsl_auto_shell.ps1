$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$fixed = '10c3ef47ad1fba636cd16345aebe9f72998d2c2f'
$baseline = '8e3605eba4d4ab9f3170ddd9b4d12de854fc41f8'
$test = 'commands::misc::native_wsl_auto_shell_qa::codex_auto_install_update_uses_native_wsl_user_shell'
$fixture = Join-Path $env:GITHUB_WORKSPACE '.github/qa/wsl_auto_shell.rs'
$baseDir = Join-Path $env:RUNNER_TEMP 'wsl-baseline'
$fixedDir = Join-Path $env:RUNNER_TEMP 'wsl-fixed'
$evidence = Join-Path $env:GITHUB_WORKSPACE 'qa-evidence'
New-Item -ItemType Directory -Force $evidence | Out-Null
$env:RUSTUP_TOOLCHAIN = '1.95.0'
$env:CARGO_BUILD_JOBS = '1'
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_PROFILE_TEST_DEBUG = '0'
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_TARGET_DIR = Join-Path $env:RUNNER_TEMP 'wsl-cargo-target'
$env:CC_SWITCH_TEST_HOME = Join-Path $env:RUNNER_TEMP 'wsl-rust-test-home'
$env:CC_SWITCH_WSL_DISTRO = 'Ubuntu-24.04'

foreach ($entry in @(@($baseline, $baseDir), @($fixed, $fixedDir))) {
    & git worktree add --detach $entry[1] $entry[0]
    if ($LASTEXITCODE -ne 0) { throw "Could not materialize exact snapshot $($entry[0])" }
    $actual = (& git -C $entry[1] rev-parse HEAD).Trim()
    if ($actual -ne $entry[0]) { throw 'Snapshot SHA mismatch' }
    New-Item -ItemType Directory -Force (Join-Path $entry[1] 'dist') | Out-Null
    $source = Join-Path $entry[1] 'src-tauri/src/commands/misc.rs'
    $injection = "`n#[cfg(all(test, target_os = `"windows`"))]`ninclude!(r#`"$fixture`"#);`n"
    [System.IO.File]::AppendAllText($source, $injection, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Snapshot($directory, $name, $expectedBaseline) {
    $manifest = Join-Path $directory 'src-tauri/Cargo.toml'
    $log = Join-Path $evidence "$name.log"
    & cargo test --manifest-path $manifest --locked --lib $test -- --ignored --exact --nocapture 2>&1 | Tee-Object -FilePath $log
    $code = $LASTEXITCODE
    $text = Get-Content -Raw $log
    if ($expectedBaseline) {
        if ($code -eq 0 -or $text -notmatch 'CCS_WSL_NATIVE_UPDATE_RESULT status=127' -or $text -notmatch 'CCS_WSL_FIXTURE_CLEANED' -or $text -notmatch '1 failed') {
            throw 'Baseline did not reproduce the expected isolated native WSL PATH failure cleanly'
        }
        Write-Output 'EXPECTED_BASELINE_RED: native cmd -> batch -> wsl -> zsh returned 127'
    } else {
        if ($code -ne 0 -or $text -notmatch 'CCS_WSL_NATIVE_GREEN:' -or $text -notmatch 'CCS_WSL_FIXTURE_CLEANED' -or $text -notmatch '1 passed') {
            throw 'Fixed native WSL regression test failed'
        }
        Write-Output 'FIXED_NATIVE_GREEN: production code 10c3ef47 passed the same fixture'
    }
}
Invoke-Snapshot $baseDir 'baseline' $true
Invoke-Snapshot $fixedDir 'fixed' $false
@{ baseline = $baseline; fixed = $fixed; qa = $env:GITHUB_SHA; fixture_sha256 = (Get-FileHash $fixture -Algorithm SHA256).Hash; result = 'expected baseline failure and fixed success' } | ConvertTo-Json | Set-Content (Join-Path $evidence 'summary.json')
