import bun from './index.js';

// This file serves two purposes:
// 1. It is the entry point for using the Bun global in the REPL. (--import this file)
// 2. It makes TypeScript check the full structural compatibility of the Bun global vs the polyfills object,
//    which allows for the type assertion below to be used as a TODO list index.

globalThis.Bun = bun as typeof bun & {
    // TODO: Missing polyfills
    readableStreamToFormData: typeof import('bun').readableStreamToFormData;
    deepEquals: typeof import('bun').deepEquals;
    deepMatch: typeof import('bun').deepMatch;
    build: typeof import('bun').build;
    mmap: typeof import('bun').mmap;
    gc: typeof import('bun').gc;
    sleep: typeof import('bun').sleep;
    connect: typeof import('bun').connect;
    listen: typeof import('bun').listen;
    indexOfLine: typeof import('bun').indexOfLine;
    peek: typeof import('bun').peek;
    Transpiler: typeof import('bun').Transpiler;
    password: typeof import('bun').password;
    CryptoHashInterface: typeof import('bun').CryptoHashInterface;
    CryptoHasher: typeof import('bun').CryptoHasher;
    FileSystemRouter: typeof import('bun').FileSystemRouter;

    //? Polyfilled but with broken types (See each one in ./src/modules/bun.ts for details)
    which: typeof import('bun').which;
    generateHeapSnapshot: typeof import('bun').generateHeapSnapshot;
    sha: typeof import('bun').sha;
    env: typeof import('bun').env;
    stdout: typeof import('bun').stdout;
    stderr: typeof import('bun').stderr;
    stdin: typeof import('bun').stdin;
};