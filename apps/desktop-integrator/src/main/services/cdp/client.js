'use strict';

const { EventEmitter } = require('node:events');

class CdpClient extends EventEmitter {
    constructor(transport, options = {}) {
        super();
        this.transport = transport;
        this.timeoutMs = options.timeoutMs || 10000;
        this.nextId = 1;
        this.pending = new Map();
        this.closed = false;

        transport.on('message', message => this.onMessage(message));
        // A malformed frame means stream synchronization can no longer be
        // trusted. Close deterministically instead of emitting an unhandled
        // EventEmitter "error" from the Electron main process.
        transport.on('protocolError', error => this.close(error));
        transport.on('close', error => this.close(error));
    }

    onMessage(message) {
        if (message.id && this.pending.has(message.id)) {
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) {
                const error = new Error(message.error.message || 'CDP command failed.');
                error.code = message.error.code;
                pending.reject(error);
            } else {
                pending.resolve(message.result || {});
            }
            return;
        }
        if (message.method) this.emit('event', message);
    }

    send(method, params = {}, sessionId = undefined) {
        if (this.closed) return Promise.reject(new Error('CDP client is closed.'));
        const id = this.nextId++;
        const message = { id, method, params };
        if (sessionId) message.sessionId = sessionId;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            try {
                this.transport.send(message);
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            }
        });
    }

    close(cause = null) {
        if (this.closed) return;
        this.closed = true;
        const error = cause instanceof Error ? cause : new Error('CDP client closed.');
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
        this.emit('close', cause);
    }
}

module.exports = { CdpClient };
