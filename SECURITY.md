# Security policy

## Supported versions

This project is below 1.0. Only the latest minor version gets security fixes, as a patch release. That version is the same for both packages, because they are released together:

| Package | Supported |
|---|---|
| [`@tvolden/block-code-editor`](https://www.npmjs.com/package/@tvolden/block-code-editor) (npm) | 0.2.x |
| [`BlockCodeEditor.Commands`](https://www.nuget.org/packages/BlockCodeEditor.Commands) (NuGet) | 0.2.x |

Older versions don't get fixes. Upgrade to the latest release instead.

## Reporting a vulnerability

**Please don't report vulnerabilities in public issues, pull requests or discussions.**

Report them privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability** ([direct link](https://github.com/TVolden/block-code-editor/security/advisories/new)). Please include:

- the package and version affected;
- what an attacker can do, and under which conditions;
- steps or a minimal example that reproduces it.

This is a project maintained by one person, so replies are best effort. You can expect the report to be acknowledged, and to hear whether it is accepted. An accepted vulnerability is fixed in a patch release of both packages. It is then disclosed in a GitHub security advisory, which credits you unless you'd rather not be named.

## Scope

In scope:
- the editor component and its exports in the npm package;
- the .NET library in the NuGet package;
- the release workflow (`.github/workflows/publish.yml`).

Some things are outside the project's control:
- **Vulnerabilities in dependencies**, such as React for the npm package. Report those to the dependency itself. A report that this project uses a vulnerable version is welcome.
- **The host's own checks.** The editor and the command contract check a canvas's structure, such as places, ids and links. They don't check who sent a command or whether that client may send it: a host that accepts commands, such as a collaboration server, must authenticate and authorize its clients itself. It can refuse a command with `HOST_REJECTED` (`docs/commands.md`).

## Releases

Both packages are published only by the release workflow, from a GitHub release. The workflow uses Trusted Publishing (OIDC) on npm and nuget.org, so no long-lived publishing tokens are stored. npm releases made since the repository became public carry provenance, which links each one to the workflow run that built it.
