'use strict';

const { EventEmitter } = require('node:events');

class PipeTransport extends EventEmitter {
    constructor(readable, writable) {
        super();
        if (!readable || !writable) throw new TypeError('Readable and writable CDP pipes are required.');
        this.readable = readable;
        this.writable = writable;
        this.buffer = Buffer.alloc(0);
        this.closed = false;

        this.onReadableData = chunk => this.onData(chunk);
        this.onReadableError = error => this.close(error);
        this.onReadableEnd = () => this.close();
        this.onWritableError = error => this.close(error);

        readable.on('data', this.onReadableData);
        readable.on('error', this.onReadableError);
        readable.on('end', this.onReadableEnd);
        writable.on('error', this.onWritableError);
    }

    onData(chunk) {
        if (this.closed) return;
        this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
        let delimiter = this.buffer.indexOf(0);
        while (delimiter !== -1) {
            const message = this.buffer.subarray(0, delimiter).toString('utf8');
            this.buffer = this.buffer.subarray(delimiter + 1);
            if (message) {
                try {
                    this.emit('message', JSON.parse(message));
                } catch (error) {
                    this.emit('protocolError', new Error(`Invalid CDP message: ${error.message}`));
                }
            }
            delimiter = this.buffer.indexOf(0);
        }
    }

    send(message) {
        if (this.closed) throw new Error('CDP pipe is closed.');
        const payload = `${JSON.stringify(message)}\0`;
        this.writable.write(payload, 'utf8');
    }

    close(error = null) {
        if (this.closed) return;
        this.closed = true;
        this.readable.removeListener('data', this.onReadableData);
        this.readable.removeListener('error', this.onReadableError);
        this.readable.removeListener('end', this.onReadableEnd);
        this.writable.removeListener('error', this.onWritableError);
        this.readable.unref?.();
        this.writable.unref?.();
        this.readable.destroy?.();
        if (this.writable !== this.readable) this.writable.destroy?.();
        this.emit('close', error);
    }
}

module.exports = { PipeTransport };
