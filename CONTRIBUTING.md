# Contributing to Rune

Thanks for your interest in contributing! This repository hosts the open-source
`@ocai/rune-core` and `@ocai/rune-react` packages. Bug reports,
fixes, and improvements are all welcome.

## Developer Certificate of Origin (DCO)

This project does **not** use a CLA. Instead, every commit must be signed off
under the [Developer Certificate of Origin](https://developercertificate.org/) —
a lightweight statement that you wrote the patch (or otherwise have the right to
contribute it) and agree to license it under the project's terms.

Sign off by adding a `Signed-off-by` trailer to each commit. Git does this for
you with `-s`:

```bash
git commit -s -m "fix: ..."
```

This appends a line matching your Git author identity:

```
Signed-off-by: Your Name <your@email.com>
```

The email in the sign-off must match the commit author's email. If you forget:

```bash
git commit --amend -s            # fix the last commit
git rebase --signoff <base-sha>  # fix every commit on your branch
```

A CI check (`.github/workflows/dco.yml`) verifies that every commit in a pull
request is signed off and will fail the PR otherwise.

## Licensing

By contributing, you agree that your contributions are licensed under the
project's [MPL-2.0](./LICENSE) license (inbound = outbound). Don't add code under
an incompatible license, and keep third-party snippets out unless they're
MPL-2.0-compatible and properly attributed.

## Development setup

Prerequisites: **Node ≥ 24** and **pnpm 9** (pinned via `packageManager`).

```bash
pnpm install
pnpm -r build      # build core + react (the demo consumes the built packages)
pnpm -r typecheck
pnpm -r test
```

A runnable demo lives in [`apps/demo`](./apps/demo):

```bash
pnpm -r build
pnpm demo          # start the demo dev server
```

## Submitting changes

1. Fork the repo and create a topic branch off `main`.
2. Keep each pull request focused on a single concern.
3. Make sure `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` all pass.
4. Sign off every commit (see DCO above).
5. Open a pull request with a clear description of the change and its motivation.

We review PRs and may suggest adjustments before merging. Thanks again for
helping improve Rune!

## Contact

For anything that shouldn't go in a public issue — e.g. a suspected security
vulnerability — see [SECURITY.md](./SECURITY.md) (report privately to
**oss@oceanai.so**).
