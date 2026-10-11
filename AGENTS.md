# Agent instructions

## Run safeguards

1. Before any browser test, check whether Chrome's profile is locked by an earlier session (for example a `SingletonLock` file or a running chrome process). Kill that session or use a fresh temporary `--user-data-dir`. Never start a browser test against a locked profile.
2. Before any merge, check the PR's draft status (`gh pr view --json isDraft`). If it's a draft, mark it ready with `gh pr ready` first. Never attempt to merge a draft PR.
