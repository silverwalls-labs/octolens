# Octolens

**Security & Configuration Auditing for GitHub Repositories**

OctoLens is a CLI tool that scans and analyzes GitHub repositories — individually, in bulk, or across entire organizations — to produce detailed reports on:

- **Security posture** – vulnerabilities, secret leaks, insecure configurations.
- **Configuration compliance** – repository settings, governance rules, industry standards.
- **Best practices** – branch protection, workflow safety, and repository hygiene.

Whether you're running a compliance audit, reviewing security health, or ensuring consistent configuration across teams, OctoLens delivers clear, actionable insights.

## ✨ Features

- 🔍 **Full-Org Scanning** – Audit one, multiple, or all repositories in a GitHub organization.
- 📋 **Detailed Reports** – Export findings in human-readable or machine-consumable formats (JSON, Markdown, SARIF).
- 🛡 **Security Checks** – Detect risky settings, missing protections, and potential vulnerabilities.
- ⚙ **Configuration Review** – Validate settings against good practices and compliance requirements.
- 🧭 **Customizable Rules** – Extend or override checks to match your own standards.

## 🚀 Installation

```bash
# Install globally via npm
npm install -g @silverwalls-labs/octolens

# Or run via npx
npx @silverwalls-labs/octolens <command>
```

Requires Node.js 24 or later.

## 🏃 Usage

```bash
# Audit a single repository
octolens scan --repo owner/name

# Audit an organization's own settings (2FA policy, member privileges,
# Actions policy, security defaults for new repositories)
octolens scan --org my-org

# Audit the organization AND every one of its repositories
octolens scan --org my-org --all-repos

# Machine-readable output, stricter threshold
octolens scan --org my-org --format json --severity medium
```

`--repo` and `--org` are mutually exclusive. Organization checks need an
org **owner** token for full coverage — with a regular member token the
admin-only checks are reported as skipped, never as silent passes
(combine with `--fail-on-skip` to treat incomplete coverage as a failure).

See [doc/usage.md](doc/usage.md) for details on `--all-repos` fleet scanning
and `--baseline` CI gating.

## 🔧 Environment Variables

OctoLens requires a GitHub token and the target organization to run.

- **`ORGANISATION`** – The name of the GitHub organization to scan.
- **`GITHUB_TOKEN`** – A valid GitHub Personal Access Token (classic or fine-grained) with `repo` and `read:org` permissions.

```bash
export ORGANISATION=my-org
export GITHUB_TOKEN=ghp_yourtokenhere
```

## 📂 Output Formats

- Pretty (default) – Colorized terminal output.
- JSON – For automation and CI pipelines.
- Markdown – For reports, job summaries, and documentation.
- SARIF – For GitHub code-scanning upload.

`--format` is repeatable; with `--out <file>` the last format goes to the
file and the others to stdout.

See [doc/sarif.md](doc/sarif.md) for setting up GitHub code-scanning integration.

## 🛠 Configuration

OctoLens reads an optional config from `$XDG_CONFIG_HOME/octolens/config.{json,jsonc,json5}`
(defaults to `~/.config/octolens/`) and `./octolens.config.{json,jsonc,json5}` in the
working directory (or an `"octolens"` key in `package.json`).

```json
{
  "rules": {
    "repo-config/require-signed-commits": "off",
    "repo-config/topics-present": "off"
  },
  "ignore": {
    "repos": ["acme/sandbox"],
    "archived": true,
    "forks": true
  }
}
```

See [doc/configuration.md](doc/configuration.md) for the full reference.

## 📖 Documentation

- [Usage Guide](doc/usage.md) – Fleet scanning, baseline CI gating.
- [Rules Reference](doc/rules.md) – All repository and organization checks.
- [SARIF Integration](doc/sarif.md) – GitHub code-scanning workflow setup.
- [Configuration](doc/configuration.md) – Config file format and options.
- [Contributing](doc/contributing.md) – Testing guide.
