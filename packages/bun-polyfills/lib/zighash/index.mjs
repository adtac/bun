// @ts-check
/// <reference types="node" />
import fs from 'fs';

const { instance } = /**
* @type {{ instance: { exports: {
*    memory: WebAssembly.Memory,
*    alloc(size: number): number,
*    wyhash(input_ptr: number, input_size: number, seed: bigint): bigint,
* } } }}
*/(/** @type {unknown} */(await WebAssembly.instantiate(fs.readFileSync('zighash.wasm'), {
    env: {
        /** @param {any} x */
        print(x) { console.log(x); },
    },
})));
const exports = instance.exports;
const mem = exports.memory;
const memview = {
    get u8() { return new Uint8Array(mem.buffer); },
    get u16() { return new Uint16Array(mem.buffer); },
    get u32() { return new Uint32Array(mem.buffer); },
    get u64() { return new BigUint64Array(mem.buffer); },
    get i8() { return new Int8Array(mem.buffer); },
    get i16() { return new Int16Array(mem.buffer); },
    get i32() { return new Int32Array(mem.buffer); },
    get i64() { return new BigInt64Array(mem.buffer); },
    get f32() { return new Float32Array(mem.buffer); },
    get f64() { return new Float64Array(mem.buffer); },
};
const encoder = new TextEncoder();
const allocBuffer = (
    /** @type {ArrayBufferView | ArrayBuffer | SharedArrayBuffer} */ buf,
    /** @type {boolean=} */ nullTerminate = false,
) => {
    const size = buf.byteLength + +nullTerminate;
    const ptr = exports.alloc(size);
    const u8heap = memview.u8;
    u8heap.set(new Uint8Array(ArrayBuffer.isView(buf) ? buf.buffer : buf), ptr);
    if (nullTerminate) u8heap[ptr + buf.byteLength] = 0;
    return { ptr, size };
};
const allocString = (
    /** @type {string} */ str,
    /** @type {boolean=} */ nullTerminate = true,
) => {
    const strbuf = encoder.encode(str);
    return allocBuffer(strbuf, nullTerminate);
};

/**
 * @param {string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer} input
 * @param {bigint=} seed
 */
export function wyhash(input, seed = 0n) {
    const { ptr, size } = typeof input === 'string' ? allocString(input, false) : allocBuffer(input);
    return BigInt.asUintN(64, exports.wyhash(ptr, size, seed));
}