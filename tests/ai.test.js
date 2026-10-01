import assert from 'node:assert/strict';
import test from 'node:test';
import { guidedReflection, reflect } from '../ai/reflection.js';
import { checkSafety } from '../safety/check.js';

const input = {
  situation: 'Ein Kollege hat auf meine Nachricht nicht geantwortet.',
  thought: 'Ich denke seit drei Tagen über dieses Gespräch nach.',
  emotion: 'Ich bin unsicher.',
  behavior: 'Ich lese die Nachricht immer wieder.',
  consequence: 'Ich kann mich nicht konzentrieren.',
  counterCheck: 'Er könnte sehr beschäftigt sein.',
  strategy: 'Morgen frage ich einmal freundlich nach.',
  mood: 3,
  useAi: true,
};
const options = { apiKey: 'mock-key', model: 'mock-model' };
const moderation = (flagged = false) => ({
  ok: true,
  json: async () => ({ results: [{ flagged }] }),
});
const providerResult = () => {
  const { source: _source, ...result } = guidedReflection(input);
  return result;
};
const completed = (result = providerResult()) => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(result) }],
      },
    ],
  }),
});

test('AI requests require per-reflection consent and complete server configuration', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error('External requests must not occur');
  };
  for (const [data, configuration] of [
    [{ ...input, useAi: false }, options],
    [{ ...input, useAi: undefined }, options],
    [input, { model: 'mock-model' }],
    [input, { apiKey: 'mock-key' }],
  ]) {
    const result = await reflect(data, { ...configuration, fetchImpl });
    assert.equal(result.source, 'guided');
    assert.equal(result.aiFallback, undefined);
    assert.equal(result.memory_candidates[0].decision, 'ASK_USER');
    assert.equal(result.hypotheses[0].status, 'hypothesis');
  }
  assert.equal(calls, 0);
});

test('local crisis screening preempts provider calls and structured analysis', async () => {
  for (const crisis of [
    'Ich will mich umbringen',
    'I want to kill myself',
    'Ich will mich um\u200bbringen',
    'Er möchte sich selbst verletzen.',
    'Ich will jemanden erstechen.',
  ]) {
    assert.equal(checkSafety(crisis).active, true);
    const result = await reflect(
      { ...input, strategy: crisis },
      {
        ...options,
        fetchImpl: async () =>
          assert.fail('Crisis text must not leave the server'),
      },
    );
    assert.equal(result.safety.active, true);
    assert.equal(result.analysis, undefined);
    assert.equal(result.memory_candidates, undefined);
  }
});

test('moderation precedes generation; validated provider output remains an unconfirmed hypothesis', async () => {
  const requests = [];
  const result = await reflect(input, {
    ...options,
    fetchImpl: async (url, configuration) => {
      requests.push({
        url,
        body: JSON.parse(configuration.body),
        configuration,
      });
      return requests.length === 1 ? moderation() : completed();
    },
  });
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      'https://api.openai.com/v1/moderations',
      'https://api.openai.com/v1/responses',
    ],
  );
  assert.equal(requests[1].body.store, false);
  assert.equal(requests[1].body.model, options.model);
  assert.equal(requests[1].body.text.format.strict, true);
  assert.deepEqual(JSON.parse(requests[1].body.input), input);
  assert.equal(result.source, 'ai');
  assert.equal(result.safety.active, false);
  assert.equal(result.hypotheses[0].status, 'hypothesis');
  assert.equal(result.memory_candidates[0].decision, 'ASK_USER');
});

test('flagged moderation stops generation and returns safety information only', async () => {
  let calls = 0;
  const result = await reflect(input, {
    ...options,
    fetchImpl: async () => {
      calls++;
      return moderation(true);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.safety.active, true);
  assert.ok(result.safety.resources.length > 0);
  assert.equal(result.analysis, undefined);
  assert.equal(result.memory_candidates, undefined);
});

test('failed or malformed moderation prevents generation and explains the guided fallback', async () => {
  for (const response of [
    { ok: false, json: async () => ({}) },
    { ok: true, json: async () => ({ results: [] }) },
    { ok: true, json: async () => ({ results: [{ flagged: 'false' }] }) },
    {
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    },
    new Error('Network failure'),
  ]) {
    let calls = 0;
    const result = await reflect(input, {
      ...options,
      fetchImpl: async () => {
        calls++;
        if (response instanceof Error) throw response;
        return response;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.source, 'guided');
    assert.equal(result.aiFallback, true);
    assert.equal(result.safety.active, false);
  }
});

test('provider failures, refusals, incomplete responses and invalid schema use a safe guided fallback', async () => {
  const invalidStatus = providerResult();
  invalidStatus.hypotheses[0].status = 'confirmed';
  const invalidMemory = providerResult();
  invalidMemory.memory_candidates[0].decision = 'SAVE';
  for (const response of [
    new Error('Provider timeout'),
    { ok: false },
    { ok: true, json: async () => ({ status: 'incomplete', output: [] }) },
    {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ content: [{ type: 'refusal', refusal: 'Cannot comply' }] }],
      }),
    },
    {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: '{invalid' }] }],
      }),
    },
    completed({ response: 'Missing required structured fields' }),
    completed(invalidStatus),
    completed(invalidMemory),
  ]) {
    let calls = 0;
    const result = await reflect(input, {
      ...options,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) return moderation();
        if (response instanceof Error) throw response;
        return response;
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.source, 'guided');
    assert.equal(result.aiFallback, true);
    assert.equal(result.hypotheses[0].status, 'hypothesis');
    assert.equal(result.memory_candidates[0].decision, 'ASK_USER');
  }
});

test('a provider safety flag or dangerous provider text removes analysis and memory candidates', async () => {
  for (const modify of [
    (result) => {
      result.safety.active = true;
    },
    (result) => {
      result.response = 'I want to kill myself';
    },
  ]) {
    const output = providerResult();
    modify(output);
    let calls = 0;
    const result = await reflect(input, {
      ...options,
      fetchImpl: async () => (++calls === 1 ? moderation() : completed(output)),
    });
    assert.equal(result.safety.active, true);
    assert.equal(result.analysis, undefined);
    assert.equal(result.memory_candidates, undefined);
  }
});
