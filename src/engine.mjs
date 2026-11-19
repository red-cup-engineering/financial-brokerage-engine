import { resolve } from 'node:path';
import { has, put } from '@red-cup-engineering/semiotic-eavt-engineering-services-section/store';
import { semanticId as addressOf } from '@red-cup-engineering/semiotic-content-address-system';
import { semanticIdOf } from '@red-cup-engineering/computer-code-engine/semiotic-expression-notation/semantic-content-identity';

export const BROKERAGE_WITNESS_ACTOR = 'urn:ame:brokerage-independent-witness-and-books';
const identify = semanticIdOf('financial-brokerage.record');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const isTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function requireValue(condition, prefix) {
  if (!condition) throw new TypeError(prefix);
}

function snapshot(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError('brokerage-record-content-invalid');
  }
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function identified(body) {
  const content = snapshot(body);
  return freeze({ id: identify(content), ...content });
}

export function attestOutcome(input) {
  requireValue(isObject(input), 'outcome-input-required');
  const {
    originatingActor, witnessActor = BROKERAGE_WITNESS_ACTOR,
    inputs, output, externalEvidence, observedAt,
  } = input;
  requireValue(isText(originatingActor), 'outcome-origin-required');
  requireValue(isText(witnessActor), 'outcome-witness-actor-required');
  requireValue(originatingActor !== witnessActor, 'assertion-refused');
  requireValue(isTime(observedAt), 'outcome-time-required');
  requireValue(Array.isArray(inputs) && inputs.length > 0 &&
    isObject(output) && isText(output.id) &&
    Array.isArray(externalEvidence) && externalEvidence.length > 0,
  'replay-evidence-incomplete');
  const inputDigests = Array.from(inputs, item => {
    requireValue(isObject(item), 'replay-evidence-incomplete');
    if (item.id == null) return identify(snapshot(item));
    requireValue(isText(item.id), 'replay-evidence-incomplete');
    return item.id;
  }).sort();
  for (const item of externalEvidence) {
    requireValue(isObject(item) && isText(item.uri) && isText(item.digest),
      'replay-evidence-incomplete');
  }
  return identified({
    type: 'BrokerageOutcomeAttestation', version: 1,
    witnessActor, originatingActor, inputDigests, outputDigest: output.id,
    externalEvidence, observedAt,
    disposition: 'replayable-evidence-recorded', correctnessClaim: 'not-unbound',
  });
}

function configuration(env, dependencies) {
  const invalid = 'brokerage-recorder-dependencies-invalid';
  requireValue(isObject(env) && isObject(dependencies), invalid);
  const now = dependencies.now ?? (() => new Date().toISOString());
  requireValue(typeof now === 'function', invalid);
  let journal = dependencies.journal;
  if (journal == null) {
    const dataRoot = env.FINANCIAL_BROKERAGE_DATA_ROOT;
    if (!isText(dataRoot)) throw new Error('FINANCIAL_BROKERAGE_DATA_ROOT is required');
    const root = resolve(dataRoot);
    journal = {
      has: record => has(root, 'financial-brokerage', addressOf(record)),
      put: record => ({ id: put(root, 'financial-brokerage', record) }),
    };
  }
  requireValue(isObject(journal) && typeof journal.has === 'function' &&
    typeof journal.put === 'function', invalid);
  return { journal, now };
}

async function persist(journal, record) {
  const present = journal.has(record);
  requireValue(typeof present === 'boolean', 'brokerage-journal-result-invalid');
  if (present) return null;
  const result = await journal.put(record);
  requireValue(isObject(result) && isText(result.id), 'brokerage-journal-result-invalid');
  const receipt = snapshot(result);
  requireValue(isObject(receipt) && isText(receipt.id), 'brokerage-journal-result-invalid');
  return freeze(receipt);
}

export function createOutcomeRecorder(env = process.env, dependencies = {}) {
  const { journal, now } = configuration(env, dependencies);
  return async function recordOutcome(input) {
    requireValue(isObject(input), 'outcome-input-required');
    // Only attestation fields are read; ignored payloads need not be serializable.
    const witness = attestOutcome({
      originatingActor: input.originatingActor, witnessActor: input.witnessActor,
      inputs: input.inputs, output: input.output, externalEvidence: input.externalEvidence,
      observedAt: input.observedAt ?? now(),
    });
    const recordReceipt = await persist(journal, witness);
    return freeze({
      type: 'RecordedBrokerageOutcome', version: 1,
      witness, graph: witness.id, recordReceipt,
    });
  };
}

export function createMarketEventRecorder(options, env = process.env, dependencies = {}) {
  requireValue(isObject(options) && isText(options.originatingActor) &&
    options.originatingActor !== BROKERAGE_WITNESS_ACTOR && isText(options.nodeId),
  'market-event-origin-required');
  const { originatingActor, nodeId } = options;
  const { journal, now } = configuration(env, dependencies);
  const recordMarketEvent = async event => {
    requireValue(isObject(event), 'market-event-required');
    const recordedAt = event.recordedAt ?? event.confirmedAt ?? event.attemptedAt ?? now();
    requireValue(isTime(recordedAt), 'market-event-time-required');
    const record = identified({
      type: 'BrokerageMarketEventRecord', version: 1,
      witnessActor: BROKERAGE_WITNESS_ACTOR, originatingActor, nodeId,
      event, recordedAt, selfAttestation: false,
    });
    const recordReceipt = await persist(journal, record);
    return freeze({
      type: 'RecordedBrokerageMarketEvent', version: 1,
      id: record.id, graph: record.id, recordReceipt,
    });
  };
  Object.defineProperties(recordMarketEvent, {
    originatingActor: { value: originatingActor, enumerable: true },
    witnessActor: { value: BROKERAGE_WITNESS_ACTOR, enumerable: true },
    nodeId: { value: nodeId, enumerable: true },
  });
  return Object.freeze(recordMarketEvent);
}
