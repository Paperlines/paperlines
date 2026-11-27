# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## What is signed

The Windows installers (`Paperlines_<version>_x64-setup.exe`, `Paperlines_<version>_x64_en-US.msi`) and the command-line tool (`paperlines-x86_64-pc-windows-msvc.exe`) on each [release](https://github.com/Paperlines/paperlines/releases). They are built from this repository by the [release workflow](../.github/workflows/release.yml) on GitHub Actions; nothing built on a personal computer is signed.

## Team roles

- Committers and reviewers: [members of the Paperlines organization](https://github.com/orgs/Paperlines/people)
- Approvers: [Yoav Yosif-Or](https://github.com/yoav-yosifor)

Every signing request for a release is approved by hand by an approver.

## Privacy

Paperlines does not send information to other networked systems unless the user asks for it, for example by looking up a paper's details or checking for a new version. See the [privacy policy](privacy.md) for every service it can contact and what is sent.
