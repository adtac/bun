import type { CryptoHashInterface, DigestEncoding, Hash } from 'bun';
import { NotImplementedError } from '../../utils/errors.js';
import murmur from 'murmurhash3js-revisited';
import nodecrypto from 'node:crypto';
import os from 'node:os';
import crc from '@foxglove/crc';
import adler32 from 'adler-32';
import md4, { Md4 } from 'js-md4';
import { Fingerprint32, Fingerprint64 } from '../../../lib/farmhash/index.mjs';
import { wyhash } from '../../../lib/zighash/index.mjs';

export const bunHash = ((data, seed = 0): bigint => wyhash(data, BigInt(seed))) as typeof Bun.hash;
export const bunHashProto: Hash = {
    wyhash(data, seed = 0) {
        return wyhash(data, BigInt(seed));
    },
    adler32(data, seed?) {
        if (typeof data === 'string') return adler32.str(data, seed);
        else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) return adler32.buf(new Uint8Array(data), seed);
        else return adler32.buf(new Uint8Array(data.buffer), seed);
    },
    crc32(data, seed?) {
        if (data instanceof Uint8Array) return crc.crc32(data);
        if (data instanceof ArrayBuffer) return crc.crc32(new Uint8Array(data));
        if (typeof data === 'string') return crc.crc32(new TextEncoder().encode(data));
        throw new Error('unimplemented');
        // Apparently, the seed is ignored by Bun currently
        //if (!seed) return crc.crc32(data as Uint8Array);
        //crc.crc32Update(seed, data as Uint8Array);
        //return crc.crc32Final(seed);
    },
    cityHash32(data) {
        return Fingerprint32(data);
    },
    cityHash64(data) {
        return Fingerprint64(data);
    },
    // murmur32v2 (?)
    murmur32v3(data, seed = 0) {
        if (typeof data === 'string') data = new TextEncoder().encode(data);
        if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) return murmur.x86.hash32(new Uint8Array(data), seed);
        return murmur.x86.hash32(new Uint8Array(data.buffer), seed);
    },
    murmur64v2(data, seed?) {
        throw new NotImplementedError('Bun.hash.murmur64v2', this.murmur64v2);
    }
};

type HashImpl = {
    digest(): Buffer;
    digest(encoding: nodecrypto.BinaryToTextEncoding): string;
    update(data: nodecrypto.BinaryLike): HashImpl;
    update(data: string, inputEncoding: nodecrypto.Encoding): HashImpl;
};
abstract class BaseHash<T> implements CryptoHashInterface<T> {
    readonly #hash: HashImpl | null;
    constructor(algorithm: string | HashImpl) {
        if (typeof algorithm === 'string') this.#hash = nodecrypto.createHash(algorithm);
        // If no preset algorithm is given, expect the subclass to fully implement its own.
        else this.#hash = algorithm;
    }
    update(data: StringOrBuffer) {
        if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) this.#hash!.update(new Uint8Array(data));
        else this.#hash!.update(data);
        return this as unknown as T; // is there any good way to do this without asserting?
    }
    digest(encoding: DigestEncoding): string;
    digest(hashInto?: TypedArray): TypedArray;
    digest(encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        if (typeof encodingOrHashInto === 'string') {
            const encoded = this.#hash!.digest(encodingOrHashInto);
            // you'd think node would throw an error if the encoding is invalid, but nope!
            // instead it silently returns as if you passed no encoding and gives a Buffer...
            if (Buffer.isBuffer(encoded)) throw new TypeError(`Unknown encoding: "${encodingOrHashInto}"`);
            else return encoded;
        }
        const digested = this.#hash!.digest();
        if (encodingOrHashInto === undefined) return new Uint8Array(digested.buffer, digested.byteOffset, digested.byteLength);
        if (encodingOrHashInto.byteLength < this.byteLength) throw new TypeError(`TypedArray must be at least ${this.byteLength} bytes`);
        if (encodingOrHashInto instanceof BigInt64Array || encodingOrHashInto instanceof BigUint64Array) {
            // avoid checking endianness for every loop iteration
            const endianAwareInsert = os.endianness() === 'LE'
                ? (arr: string[], j: number, num: string) => arr[7 - j] = num
                : (arr: string[], j: number, num: string) => arr[j] = num;

            for (let i = 0; i < digested.byteLength; i += 8) {
                const bigintStrArr = ['', '', '', '', '', '', '', ''];
                for (let j = 0; j < 8; j++) {
                    const byte = digested[i + j];
                    if (byte === undefined) break;
                    endianAwareInsert(bigintStrArr, j, byte.toString(16).padStart(2, '0'));
                }
                encodingOrHashInto[i / 8] = BigInt(`0x${bigintStrArr.join('')}`);
            }
        } else {
            const HashIntoTypedArray = encodingOrHashInto.constructor as TypedArrayConstructor;
            // this will work as long as all hash classes have a byteLength that is a multiple of 4 bytes
            encodingOrHashInto.set(new HashIntoTypedArray(digested.buffer, digested.byteOffset, digested.byteLength / HashIntoTypedArray.BYTES_PER_ELEMENT));
        }
        return encodingOrHashInto;
    }
    static hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray { return '' };
    static readonly byteLength: number;
    abstract readonly byteLength: number;
}

export class SHA1 extends BaseHash<SHA1> {
    constructor() { super('sha1'); }
    static override readonly byteLength = 20;
    override readonly byteLength = 20;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class MD4 extends BaseHash<MD4> {
    constructor() { //! Not supported by nodecrypto
        const hash = md4.create() as unknown as Omit<Md4, 'toString'> & { _update: Md4['update'] };
        function digest(): Buffer;
        function digest(encoding: nodecrypto.BinaryToTextEncoding): string;
        function digest(encoding?: nodecrypto.BinaryToTextEncoding) {
            const buf = Buffer.from(hash.arrayBuffer());
            if (encoding) return buf.toString(encoding);
            else return buf;
        }
        function update(data: nodecrypto.BinaryLike) {
            if (typeof data === 'string') hash._update(data);
            else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) hash._update(new Uint8Array(data));
            else hash._update(new Uint8Array(data.buffer));
            return hash as unknown as MD4HashImpl;
        }
        type MD4HashImpl = Omit<Md4, 'toString'> & { digest: typeof digest, update: typeof update };
        // @ts-expect-error patches to reuse the BaseHash methods
        hash.digest = digest; hash._update = hash.update; hash.update = update;
        super(hash as unknown as MD4HashImpl);
    } 
    static override readonly byteLength = 16;
    override readonly byteLength = 16;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class MD5 extends BaseHash<MD5> {
    constructor() { super('md5'); }
    static override readonly byteLength = 16;
    override readonly byteLength = 16;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class SHA224 extends BaseHash<SHA224> {
    constructor() { super('sha224'); }
    static override readonly byteLength = 28;
    override readonly byteLength = 28;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class SHA512 extends BaseHash<SHA512> {
    constructor() { super('sha512'); }
    static override readonly byteLength = 64;
    override readonly byteLength = 64;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class SHA384 extends BaseHash<SHA384> {
    constructor() { super('sha384'); }
    static override readonly byteLength = 48;
    override readonly byteLength = 48;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class SHA256 extends BaseHash<SHA256> {
    constructor() { super('sha256'); }
    static override readonly byteLength = 32;
    override readonly byteLength = 32;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}
export class SHA512_256 extends BaseHash<SHA512_256> {
    constructor() { super('sha512-256'); }
    static override readonly byteLength = 32;
    override readonly byteLength = 32;
    static override hash(data: StringOrBuffer, encoding?: DigestEncoding): string;
    static override hash(data: StringOrBuffer, hashInto?: TypedArray): TypedArray;
    static override hash(data: StringOrBuffer, encodingOrHashInto?: DigestEncoding | TypedArray): string | TypedArray {
        const instance = new this(); instance.update(data);
        return instance.digest(encodingOrHashInto as DigestEncoding & TypedArray);
    }
}