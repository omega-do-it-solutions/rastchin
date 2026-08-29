'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { PipeTransport } = require('../src/main/services/cdp/pipeTransport');
const { CdpClient } = require('../src/main/services/cdp/client');

test('pipe transport handles fragmented null-delimited CDP messages', async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const transport = new PipeTransport(readable, writable);
    const received = [];
    transport.on('message', message => received.push(message));
    readable.write('{"id":1,"res');
    readable.write('ult":{"ok":true}}\0{"method":"Page.loadEventFired"}\0');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(received, [
        { id: 1, result: { ok: true } },
        { method: 'Page.loadEventFired' }
    ]);
});

test('CDP client resolves command responses and includes session id', async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const transport = new PipeTransport(readable, writable);
    const client = new CdpClient(transport, { timeoutMs: 1000 });
    const chunks = [];
    writable.on('data', chunk => chunks.push(chunk));
    const pending = client.send('Runtime.enable', {}, 'session-1');
    await new Promise(resolve => setImmediate(resolve));
    const sent = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/\0$/, ''));
    assert.equal(sent.method, 'Runtime.enable');
    assert.equal(sent.sessionId, 'session-1');
    readable.write(`${JSON.stringify({ id: sent.id, result: { enabled: true } })}\0`);
    assert.deepEqual(await pending, { enabled: true });
});

test('CDP client rejects protocol errors', async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const transport = new PipeTransport(readable, writable);
    const client = new CdpClient(transport, { timeoutMs: 1000 });
    let request;
    writable.once('data', chunk => {
        request = JSON.parse(String(chunk).replace(/\0$/, ''));
        readable.write(`${JSON.stringify({ id: request.id, error: { code: -1, message: 'nope' } })}\0`);
    });
    await assert.rejects(client.send('Target.getTargets'), /nope/);
});

test('a malformed CDP frame closes the client without an unhandled error event', async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const transport = new PipeTransport(readable, writable);
    const client = new CdpClient(transport, { timeoutMs: 1000 });
    const closed = new Promise(resolve => client.once('close', resolve));

    readable.write('{not-json}\0');
    const error = await closed;

    assert.equal(client.closed, true);
    assert.match(error.message, /Invalid CDP message/);
    transport.close();
    assert.equal(readable.destroyed, true);
    assert.equal(writable.destroyed, true);
});
