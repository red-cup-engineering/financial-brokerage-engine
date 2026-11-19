# financial-brokerage-engine

Generates a brokerage evidence-recording system that records independent outcome attestations and market events in a content-addressed journal, retaining actor provenance, evidence digests, observation times, and persistence receipts.

## API contract

This is the binding target for the implementation and consumer-migration sessions. The founding commit changes package metadata and documentation only; its inherited src/ and test/ and manifest exports/dependencies remain for the implementation session to replace. An engine “generates system”: this engine generates a brokerage evidence-recording system through configured outcome and market-event recorders. It neither executes trades nor settles consideration nor verifies product correctness.

### Public module and names

The implementation must use `src/engine.mjs` as its public module, with exactly `"exports": { ".": "./src/engine.mjs" }`. Import only from `@red-cup-engineering/financial-brokerage-engine`. No default export or source-file subpath is public. Internal modules are implementation choices.

There are exactly four named exports:

```js
BROKERAGE_WITNESS_ACTOR // string
attestOutcome(input) // synchronous -> OutcomeAttestation
createOutcomeRecorder(env = process.env, dependencies = {})
  // synchronous -> async recordOutcome(input)
createMarketEventRecorder(options, env = process.env, dependencies = {})
  // synchronous -> async recordMarketEvent(event)
```

`BROKERAGE_WITNESS_ACTOR` is exactly `"urn:ame:brokerage-independent-witness-and-books"`. It names the existing independent actor, not this module's layout. Preserve that value: the settlement checks at `scripts/settlement-provider.mjs:6,10` and `services/union-consideration-settlement-service/src/settlement-provider.mjs:6,10`, and onboarding at `services/principal-brokerage-interface/src/onboarding-circuit.mjs:4,8`, compare it with recorder metadata or returned witnesses. These paths are relative to Alpaca, defined below.

### Content, identity, and snapshots

`Text` is a string with nonempty `.trim()`; retain its original text. `Time` is a string for which `Number.isFinite(Date.parse(value))` is true; preserve it without reformatting. An options/input object must be non-null and not an array. Required ids, actors, evidence uri/digest, and nodeId are Text.

Retained content uses a detached JSON snapshot, defined by `JSON.parse(JSON.stringify(value))`, before identity, storage, and freezing. Thus undefined object fields are omitted; undefined array members become null; Date and custom toJSON values use their JSON representation. Do not impose a separate plain-object-only or recursive JSON-admission validator. The shadow-assay events at Alpaca `scripts/run-shadow-assay.mjs:78` and `services/institutional-investment-shadow-deployment/scripts/run-shadow-assay.mjs:41` copy optional values such as `venueRequestId` into retained objects; these may be undefined. Normalizing at this boundary accepts that content without freezing caller-owned values. Cyclic/non-serializable content is refused; house identity/addressing may impose additional admission rules and their failures propagate. Inputs with explicit ids and output payload fields other than id are not retained or serialized.

All returned record structures, their nested witnesses/evidence/arrays, and record receipts are deeply frozen snapshots. Stored records are likewise detached and deeply frozen before a journal sees them. Never mutate or freeze caller input or the journal's original receipt. Compute ids over the exact snapshot being returned/stored.

Let `identify = semanticIdOf("financial-brokerage.record")` from `@red-cup-engineering/computer-code-engine/semiotic-expression-notation/semantic-content-identity`. Top-level record ids identify their body without the added id. Complete-record storage addresses use the separate house content-address function. `graph` is the semantic record id; it does not assert an RDF graph was created.

### Outcome attestation

`attestOutcome(input)` accepts:

| Field | Requirement |
| --- | --- |
| originatingActor | Required Text, different from witnessActor. Empty actors are refused. |
| witnessActor | Optional Text, default BROKERAGE_WITNESS_ACTOR when undefined. Custom independent witness actors remain supported. |
| inputs | Required nonempty array of input objects. Use each non-nullish Text id; otherwise identify its JSON snapshot. |
| output | Required object with Text id. Other output fields are ignored. |
| externalEvidence | Required nonempty array of objects, each with Text uri and digest. Retain additional JSON fields and array order. |
| observedAt | Required Time; the pure function has no clock default. |

Sort input ids with JavaScript's default lexical `.sort()`; retain duplicates. Return synchronously:

```js
body = {
  type: "BrokerageOutcomeAttestation", version: 1,
  witnessActor, originatingActor,
  inputDigests: sortedInputIds, outputDigest: output.id,
  externalEvidence: evidenceSnapshot, observedAt,
  disposition: "replayable-evidence-recorded", correctnessClaim: "not-unbound"
}
OutcomeAttestation = { id: identify(body), ...body }
```

This records the availability of supplied replay evidence; it does not fetch, authenticate, or replay that evidence or prove the output correct.

### Recorder configuration and storage

Both factories accept an environment object and optional dependencies object; additional fields are ignored. The only engine environment variable is `FINANCIAL_BROKERAGE_DATA_ROOT`, a required Text path resolved through `node:path.resolve` for the default journal. The old `BROKERAGE_BOOKS_DATA_ROOT` is not read. No root is required or read when a journal is injected.

Dependencies:

- `journal`: optional/nullish; otherwise an object implementing synchronous `has(record) -> boolean` and `put(record) -> Receipt | Promise<Receipt>`. Receipt is a JSON-representable object with Text id; extra fields are retained in the detached receipt snapshot. `has` receives the complete record. `put` must finish persistence before resolving. Nullish selects the default journal.
- `now`: optional/nullish synchronous function returning Time; default `() => new Date().toISOString()`. Invoke it only when the applicable timestamps are all nullish. Validate its selected result with the applicable time check.

The default journal stores under type `"financial-brokerage"`. It implements `has(record)` with `has(root, "financial-brokerage", addressOf(record))` and `put(record)` with `{ id: put(root, "financial-brokerage", record) }`. Import has/put from the EAVT package's `/store` and addressOf as semanticId from the content-address package root. Reuse the house store; no second persistence implementation. Factories validate configuration synchronously. No network service or RDF authority is required.

### Outcome recorder

`createOutcomeRecorder(env, dependencies)` returns async `recordOutcome(input)`. It takes the attestation fields above, except observedAt may be absent/nullish and defaults to now(). Form the attestation, call journal.has once, and if false await journal.put once. Resolve to:

```js
{
  type: "RecordedBrokerageOutcome", version: 1,
  witness: OutcomeAttestation, graph: OutcomeAttestation.id,
  recordReceipt: receiptSnapshot // null when already present
}
```

The witness field is the independent evidence attestation; callers can still obtain it from recorded.witness. No outcome-recorder metadata properties are promised.

### Market-event recorder

`createMarketEventRecorder(options, env, dependencies)` requires Text originatingActor and Text nodeId. originatingActor must differ from BROKERAGE_WITNESS_ACTOR. Return a frozen async callable with enumerable, nonwritable, nonconfigurable metadata properties originatingActor, witnessActor (BROKERAGE_WITNESS_ACTOR), and nodeId. This supports independent-recorder checks at settlement and onboarding boundaries.

`recordMarketEvent(event)` requires an event object. Retain the whole event snapshot. Choose recordedAt from `event.recordedAt ?? event.confirmedAt ?? event.attemptedAt ?? now()`. The selected value must be Time; do not skip an invalid non-nullish timestamp. No event type discriminator is required.

```js
body = {
  type: "BrokerageMarketEventRecord", version: 1,
  witnessActor: BROKERAGE_WITNESS_ACTOR, originatingActor, nodeId,
  event: eventSnapshot, recordedAt, selfAttestation: false
}
record = { id: identify(body), ...body }
```

nodeId is stored and participates in identity: provenance must survive persistence, rather than existing only on a function. Call journal.has once; if false await journal.put once. Resolve to:

```js
{
  type: "RecordedBrokerageMarketEvent", version: 1,
  id: record.id, graph: record.id,
  recordReceipt: receiptSnapshot // null when already present
}
```

The market record itself is stored, not additionally returned. Identical normalized content/provenance/times produces the same semantic id. A fallback clock may make repeated calls distinct. The has/put sequence is not an atomic transaction or a concurrency guarantee.

### Errors

These engine-generated errors use the listed message prefixes; suffix detail is allowed. No additional error code is promised. Pure function/factory errors throw synchronously; errors during returned async calls reject. Validation precedes journal access. Multiple simultaneous defects have no promised error precedence.

| Condition | Class and message prefix |
| --- | --- |
| Missing/nonobject outcome input | TypeError `outcome-input-required` |
| Empty/missing/nonstring outcome originatingActor | TypeError `outcome-origin-required` |
| Invalid explicit outcome witnessActor | TypeError `outcome-witness-actor-required` |
| Outcome origin equals witness actor | TypeError `assertion-refused` |
| Invalid/missing selected outcome time | TypeError `outcome-time-required` |
| Missing/invalid inputs, input id, output id, evidence, evidence uri/digest | TypeError `replay-evidence-incomplete` |
| Invalid market options/origin/nodeId, or origin equals witness actor | TypeError `market-event-origin-required` |
| Missing/nonobject market event | TypeError `market-event-required` |
| Invalid selected market time | TypeError `market-event-time-required` |
| Snapshot serialization/parsing fails | TypeError `brokerage-record-content-invalid` |
| Invalid env/dependencies objects, journal methods, or clock type | TypeError `brokerage-recorder-dependencies-invalid` |
| Default journal root missing/empty/nonstring | Error `FINANCIAL_BROKERAGE_DATA_ROOT is required` |
| has result not boolean, or put receipt lacks a Text id | TypeError `brokerage-journal-result-invalid` |

Journal exceptions/rejections, clock exceptions, filesystem/store failures (including corruption/size limits), and house identity/addressing refusals propagate unchanged, retaining their original class, message, and code. Never turn such failures into success receipts. No automatic retries, root fallback, or legacy-record migration.

### Identity and deployment evidence

Read-only searches covered the entire `/home/emsenn/bare-cedar-fog` tree, including ignored/hidden files but excluding .git and node_modules. Searches for the old semantic object kind and all four record-type literals found only the old/new seed implementation and a census note. No stored witness/event payloads were found. A filename search likewise found no old storage-type journal. The census is `CSESS/services/computer-data-systems-engineering-services-section/services/computer-log-systems-engineering-services-section/data/records/census-records/2026-10-10-ledger-carrier-census.json:545,552`; its note calls the object kind a stub. It is not evidence that records exist. This is a bounded local inventory, not a claim about remote hosts.

Accordingly use engine-specific values:

| Old value | Target value | Evidence/decision |
| --- | --- | --- |
| storage type brokerage-independent-witness | financial-brokerage | No corresponding journal found. |
| object kind brokerage.independent-witness-and-books.record | financial-brokerage.record | Only seed source and census note found. |
| IndependentBrokerageOutcomeWitness | BrokerageOutcomeAttestation | No stored payload or consumer literal comparison found. |
| RecordedIndependentBrokerageOutcomeWitness | RecordedBrokerageOutcome | No stored payload or consumer literal comparison found. |
| IndependentBrokerageMarketEventRecord | BrokerageMarketEventRecord | No stored payload or consumer literal comparison found. |
| RecordedIndependentBrokerageMarketEvent | RecordedBrokerageMarketEvent | No stored payload or consumer literal comparison found. |

These changes deliberately change identities and the storage namespace; do not relabel old records or promise old ids. The actor value remains unchanged for the demonstrated inter-system checks.

System and user `systemctl list-units --all` were checked; no brokerage/Alpaca/Esther/shadow/MetroPlat unit matched. Recursive searches in operations-services-section records and `/etc/systemd/system`, `/usr/lib/systemd/system`, and `/home/emsenn/.config/systemd` found no BROKERAGE_BOOKS_DATA_ROOT setting. All discovered runtime setters/readers are in the Alpaca consumer tree listed below. Seed-package source/tests are the other matches; implementation replaces those. There is therefore no demonstrated external deployment setter requiring a legacy alias. No operations changes are made by this session.

### Dependencies

Keep these verified stable caret ranges in the implementation:

| House package under @red-cup-engineering | Range | Use | Registry stable version satisfying range |
| --- | --- | --- | --- |
| semiotic-eavt-engineering-services-section | ^0.6.0 | has/put from /store | 0.6.6, latest; 0.6.1–0.6.6 exist, although 0.6.0 itself is absent |
| semiotic-content-address-system | ^0.1.5 | semanticId storage addressing | 0.1.5, latest |
| computer-code-engine | ^0.1.0 | semanticIdOf capability | 0.1.9, latest |

Drop computer-data-engineering-services-section: no source import uses it. Its old ^0.7.4 has stable 0.7.4 and latest 0.7.5 available, but availability does not justify an unused dependency. Registry metadata and relevant published source archives were inspected at `http://localhost:18821` without writes. No file:, workspace:, exact, or prerelease ranges. No finance-engine dependency is inferred: the live image does not specify this engine's dependencies.

### Migration table and consumer work map

| Old API/configuration | New API/configuration |
| --- | --- |
| witnessBrokerageOutcome | attestOutcome |
| createBrokerageOutcomeWitnessRecorder | createOutcomeRecorder |
| createBrokerageMarketEventRecorder | createMarketEventRecorder |
| Duplicated actor literal / local INDEPENDENT_BOOKS_ACTOR | BROKERAGE_WITNESS_ACTOR; same string value |
| BROKERAGE_BOOKS_DATA_ROOT | FINANCIAL_BROKERAGE_DATA_ROOT; no old-name alias |
| Root or /src/witness.mjs package import | New package root only; old subpath removed |

All paths below are relative to Alpaca:
`/home/emsenn/bare-cedar-fog/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/web-computer-systems-engineering-services-section/services/financial-web-computer-systems-engineering-services-section/services/web2-financial-brokerage-platform-engineering-services-section/services/alpaca-engineering-services-section`.
CSESS means `/home/emsenn/bare-cedar-fog/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section`. Line numbers are the inspected source positions; edits may shift them. Replace old package imports with the new package root and declare its published stable caret dependency when a stable release is available; this founding prerelease is not an upstream release pin.

| Consumer file:line | Required change |
| --- | --- |
| scripts/run-shadow-assay.mjs:8,72,80 | Import/call createMarketEventRecorder. |
| scripts/run-shadow-assay.mjs:38,42 | Rename both process.env lookup and runtimeEnv property to FINANCIAL_BROKERAGE_DATA_ROOT; use it for mkdir. Existing chosen directory can remain. |
| scripts/settlement-provider.mjs:6,10 | Import BROKERAGE_WITNESS_ACTOR; replace duplicate constant/default reference or re-export a local alias if its own callers require it. Actor value and independence checks stay. |
| src/esther-onboarding.mjs:1,15 | Import/call createMarketEventRecorder; pass renamed root in env. |
| src/union-runtime.mjs:2,16,22 | Import/call createMarketEventRecorder and createOutcomeRecorder; preserve supplied callback option names. |
| src/virtuals-runtime.mjs:1,10,11 | Import/call createOutcomeRecorder and createMarketEventRecorder; preserve recordDelivery/onEvent adapter names. |
| services/alpaca-esther-paper-trading-loop/src/venue-authority.mjs:2,92 | Import/call createOutcomeRecorder; construct env with FINANCIAL_BROKERAGE_DATA_ROOT. Local booksDataRoot/recordOutcomeWitness adapter names need not be engine exports. |
| services/alpaca-esther-paper-trading-loop/src/pipeline.mjs:137,163,198 | Adapter calls remain valid with unchanged arguments and recorded.witness envelope; no direct engine import needed. Accept new type/id values and retain local recordOutcomeWitness adapter or rename it consistently within this consumer. |
| services/coinbase-x402-bazaar-border/src/server.mjs:5,69,85,87 | Import/call createOutcomeRecorder. Delivery input and recorded.witness extraction remain valid. |
| services/coinbase-x402-bazaar-border/src/product-providers.mjs:14,183 | Import/call createMarketEventRecorder; shared dependencies extras remain allowed. |
| services/institutional-investment-shadow-deployment/scripts/run-shadow-assay.mjs:4,28,35,43 | Import/call createMarketEventRecorder; require FINANCIAL_BROKERAGE_DATA_ROOT instead of the old variable. |
| services/principal-brokerage-interface/src/onboarding-circuit.mjs:4,8 | Import BROKERAGE_WITNESS_ACTOR; replace duplicate literal/reference while retaining metadata checks. |
| services/union-consideration-settlement-service/src/settlement-provider.mjs:6,10 | Import BROKERAGE_WITNESS_ACTOR; replace duplicate literal/default reference while retaining independence checks. |
| src/readiness.mjs:11,31 | Change root lookups to FINANCIAL_BROKERAGE_DATA_ROOT; account-setting policy belongs to this consumer, not the engine. |
| services/alpaca-esther-paper-trading-loop/src/execute-authorized-intent-cli.mjs:48 | Change required env lookup and diagnostic label to FINANCIAL_BROKERAGE_DATA_ROOT. |
| test/readiness.test.mjs:8 | Update environment fixture root key; reassess assertions against the intended readiness behavior. |
| test/operational-services.test.mjs:130,143 | Update recorder imports/calls and injected environment root key; reassess assertions against this contract. |
| services/alpaca-esther-paper-trading-loop/test/pipeline.test.mjs:56 | Update recorder import/call and environment root key; reassess fixtures against this contract. |

No external operations setter was found to hand off. Tests are migration locations, not evidence that the inherited behavior is correct. Consumer dependency manifests and any additional importers found by that session must use the new package; do not advance ancestors or deploy from this founding session.
