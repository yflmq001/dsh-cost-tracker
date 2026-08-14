# dsh-cost-tracker

Token cost tracking for DeepSeek Harness, with per-model configurable pricing and
peak/off-peak rates.

## What it does

- Prices every finalized LLM call (`assistant/message` usage) against a
  per-model pricing table you configure — cache-hit / cache-miss input, output,
  and optional peak-window rates.
- Publishes a per-session `cost` projection (total / peak / off-peak / per-model),
  consumed by the Web UI to show a live session cost readout.
- Flags calls that land in a configured peak window.
- Models without a pricing entry are surfaced as "unconfigured" with a
  placeholder, so you know to add them.

## Installation

Install into a dsh profile straight from GitHub:

```sh
dsh plugin --profile web add github:yflmq001/dsh-cost-tracker
```

Then add the plugin to that profile's `cordis.patch.yml` (the plugin ships no
`dsh.bundle` layer, so `dsh plugin add` installs it as a plain dependency and
you enable it yourself):

```yaml
- insert:
    - id: cost-tracker
      name: 'dsh-cost-tracker'
      config:
        models: {}
```

The cross-session bill persists through dsh's storage domain; a profile
without a storage backend keeps the bill in memory only.

## Configuration

Pricing lives under the plugin's config (Schemastery-validated). All prices are
currency units per **million tokens**; you fill them in manually (no scraping).

```yaml
- name: 'dsh-cost-tracker'
  config:
    models:
      deepseek-v4-flash:
        inputMiss: 1.0        # cache-miss input
        inputHit: 0.02        # cache-hit input (omit if no cache tier)
        output: 2.0
        peak:                 # peak tier: hours + toggle + prices
          hours: ["09:00-12:00", "14:00-18:00"]   # Beijing time
          enabled: true       # false = peak off (base rates always); omit = on
          inputMiss: 3.0
          inputHit: 0.10
          output: 9.0
      gpt-4o:                 # any model the harness can reach
        inputMiss: 2.5
        output: 10.0
```

## Session projection

The plugin registers the `cost` projection:

```ts
{
  totalCost, peakCost, offpeakCost,
  callCount, unconfiguredCalls, unconfiguredModels,
  byModel: { [model]: { inputHit, inputMiss, output, total } },
}
```

Cache writes are priced at the miss rate (providers bill the write at the miss
tier; the written tokens become cache hits on a later call).

## Known Limitations and Deferred Work

- Per-session cost is a projection over the durable log (replayed); the
  cross-session global bill and `/cost` command are available.
- Non-DeepSeek models need their pricing filled in manually; there is no
  automatic price lookup.
- Developer preview: `assistant/message.usage` is absent when the adapter
  reports no accounting, and the session format has no compatibility promise.
