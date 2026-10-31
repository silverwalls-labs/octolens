# Configuration

OctoLens reads an optional config from two locations, merged in order
(the later source wins per key; `rules` entries merge by rule ID):

1. `$XDG_CONFIG_HOME/octolens/config.{json,jsonc,json5}` — defaults to
   `~/.config/octolens/`
2. `./octolens.config.{json,jsonc,json5}` in the working directory, or
   an `"octolens"` key in its `package.json`

Each extension is parsed with its exact grammar: `.json` is strict JSON,
`.jsonc` adds comments and trailing commas (and nothing more), `.json5`
follows the [JSON5 spec](https://json5.org). The `package.json` key is
strict JSON like the rest of the manifest.

Each location accepts **at most one source**: finding several (say, a
`.json` next to a `.jsonc`, or a config file plus a populated
`package.json` key) aborts with exit code 2 listing every source found —
nothing is silently picked. Explicitly typed CLI flags override config
values; config values override built-in defaults. An invalid source
(malformed syntax, unknown keys, wrong types, or a `rules` entry whose
ID matches no built-in rule) also aborts with exit
code 2 and a message naming the source and the offending key.

## Example

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
  },
  "org": {
    "concurrency": 8
  }
}
```

## Reference

- `rules` — map a rule ID to `"off"` to disable it, or to a severity
  (`critical` | `high` | `medium` | `low` | `info`) to remap the rule's
  findings; remapped severities respect the `--severity` threshold. A rule
  ID that matches no built-in rule aborts with exit code 2.
- `ignore.repos` — repositories (`owner/name`) skipped in `--all-repos` scans.
- `ignore.archived` — skip archived repositories (default `true`;
  `--include-archived` forces it to `false`).
- `ignore.forks` — skip forked repositories in `--all-repos` scans.
- `org.concurrency` — repositories scanned in parallel with `--all-repos`,
  between 1 and 32 (overridden by `--concurrency`).

## `package.json` key

In a Node project the same shape can live under a `package.json` key
instead of a dedicated file:

```json
{
  "name": "my-app",
  "octolens": {
    "rules": { "repo-config/topics-present": "off" }
  }
}
```
