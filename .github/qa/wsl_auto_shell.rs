// QA-only module injected unchanged into the baseline and fixed Windows crates.
// It executes the real production batch-line builder, not a reimplementation.
mod native_wsl_auto_shell_qa {
    use super::*;
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Output, Stdio};

    fn script(distro: &str, source: &str) -> Output {
        let mut child = Command::new("wsl.exe")
            .args(["-d", distro, "-u", "root", "--exec", "sh", "-s"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start real WSL");
        child
            .stdin
            .take()
            .unwrap()
            .write_all(source.as_bytes())
            .unwrap();
        child.wait_with_output().unwrap()
    }

    fn successful(output: Output) -> String {
        assert!(
            output.status.success(),
            "WSL fixture command failed: {:?}; {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap()
    }

    fn batch(
        distro: &str,
        user: &str,
        payload: &str,
        shell: Option<&str>,
        flag: Option<&str>,
    ) -> Output {
        let line = build_wsl_tool_action_line_with_exec(distro, payload, shell, flag, false)
            .expect("production non-direct lifecycle line")
            .replacen(
                &format!("wsl.exe -d {distro} "),
                &format!("wsl.exe -d {distro} -u {user} "),
                1,
            );
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("native-wsl-lifecycle.bat");
        std::fs::write(
            &path,
            format!("@echo off\r\n{line}\r\nexit /b %errorlevel%\r\n"),
        )
        .unwrap();
        Command::new("cmd.exe")
            .args(["/D", "/C"])
            .arg(path)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .unwrap()
    }

    #[test]
    #[ignore = "Requires disposable real Windows/WSL2 runner and CC_SWITCH_WSL_DISTRO"]
    fn codex_auto_install_update_uses_native_wsl_user_shell() {
        let distro = std::env::var("CC_SWITCH_WSL_DISTRO").unwrap();
        assert!(is_valid_wsl_distro_name(&distro));
        let user = format!("ccs-zsh-{}", std::process::id());
        let home = format!("/tmp/{user}");
        let setup = r#"set -eu
user=__USER__
home=__HOME__
command -v zsh >/dev/null
# Never allow a real npm/network installer to be reached, even on a changed image.
[ ! -e /usr/bin/npm ] && [ ! -e /bin/npm ]
[ ! -e "$home" ]
useradd -M -d "$home" -s /usr/bin/zsh "$user"
mkdir -p "$home/node prefix's 中文"
printf 'export PATH=/usr/bin:/bin\n' > "$home/.zshenv"
printf '%s\n' 'export PATH="$HOME/node prefix'"'"'s 中文:$PATH"' > "$home/.zshrc"
cat > "$home/node prefix's 中文/npm" <<'CCS_NPM'
#!/bin/sh
printf 'CALL\n' >> "$HOME/calls"
printf '<%s>\n' "$@" >> "$HOME/calls"
if [ -f "$HOME/fail" ]; then exit 42; fi
printf 'FAKE_NPM_OK\n'
CCS_NPM
chmod 755 "$home/node prefix's 中文/npm"
chown -R "$user:$user" "$home"
"#
        .replace("__USER__", &shell_single_quote(&user))
        .replace("__HOME__", &shell_single_quote(&home));
        successful(script(&distro, &setup));

        // Always clean up our disposable account, including the expected baseline panic.
        let result = std::panic::catch_unwind(|| {
            let update =
                wsl_tool_action_shell_command("codex", ToolLifecycleAction::Update).unwrap();
            let install =
                wsl_tool_action_shell_command("codex", ToolLifecycleAction::Install).unwrap();
            assert_eq!(update, "npm i -g @openai/codex@latest");
            assert_eq!(
                install, update,
                "fixture must never execute an online installer"
            );
            let out = batch(&distro, &user, &update, None, None);
            eprintln!(
                "CCS_WSL_NATIVE_UPDATE_RESULT status={} stdout={} stderr={}",
                out.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            assert!(
                out.status.success(),
                "automatic Codex update must discover npm from real .zshrc"
            );
            assert!(String::from_utf8_lossy(&out.stdout).contains("FAKE_NPM_OK"));
            successful(batch(&distro, &user, &install, None, None));
            let quote_payload =
                "npm 'value with spaces' '中文' 'percent% amp& bang!' 'quote\" dollar$'";
            successful(batch(&distro, &user, quote_payload, None, None));
            let calls = successful(script(
                &distro,
                &format!("cat {}", shell_single_quote(&format!("{home}/calls"))),
            ));
            assert_eq!(calls, "CALL\n<i>\n<-g>\n<@openai/codex@latest>\nCALL\n<i>\n<-g>\n<@openai/codex@latest>\nCALL\n<value with spaces>\n<中文>\n<percent% amp& bang!>\n<quote\" dollar$>\n");

            successful(script(
                &distro,
                &format!(
                    "touch {}; chown {user}:{user} {}",
                    shell_single_quote(&format!("{home}/fail")),
                    shell_single_quote(&format!("{home}/fail"))
                ),
            ));
            let failed = batch(&distro, &user, "npm failing-action", None, None);
            assert_eq!(
                failed.status.code(),
                Some(42),
                "preserve action failure without retry"
            );
            let after = successful(script(
                &distro,
                &format!("cat {}", shell_single_quote(&format!("{home}/calls"))),
            ));
            assert_eq!(after, format!("{calls}CALL\n<failing-action>\n"));
            // Explicit sh -c intentionally does not initialize zsh, in both snapshots.
            let explicit = batch(&distro, &user, "npm must-not-run", Some("sh"), Some("-c"));
            assert_eq!(explicit.status.code(), Some(127));
            let unchanged = successful(script(
                &distro,
                &format!("cat {}", shell_single_quote(&format!("{home}/calls"))),
            ));
            assert_eq!(unchanged, after);
            eprintln!("CCS_WSL_NATIVE_GREEN: update/install/quoting/exit42/single-run/explicit-shell passed");
        });

        let cleanup = r#"set -eu
user=__USER__
home=__HOME__
case "$user" in ccs-zsh-*) ;; *) exit 96 ;; esac
[ "$home" = "/tmp/$user" ] || exit 96
uid=$(id -u "$user")
[ "$uid" -gt 0 ]
if pgrep -u "$uid" >/dev/null; then
  timeout --kill-after=5s 15s loginctl terminate-user "$user"
  for attempt in $(seq 1 30); do
    pgrep -u "$uid" >/dev/null || break
    sleep 1
  done
fi
userdel "$user"
rm -rf "$home"
printf 'CCS_WSL_FIXTURE_CLEANED\n'
"#
        .replace("__USER__", &shell_single_quote(&user))
        .replace("__HOME__", &shell_single_quote(&home));
        let cleaned = successful(script(&distro, &cleanup));
        eprintln!("{cleaned}");
        if let Err(panic) = result {
            std::panic::resume_unwind(panic);
        }
    }
}
