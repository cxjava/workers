import "./wasm_exec.js";
import { createRuntimeContext, loadModule } from "./runtime.mjs";

let mod;

globalThis.tryCatch = (fn) => {
  try {
    return {
      result: fn(),
    };
  } catch (e) {
    return {
      error: e,
    };
  }
};

async function run(ctx) {
  console.log('[DEBUG] run() started');
  
  if (mod === undefined) {
    console.log('[DEBUG] Loading WASM module...');
    mod = await loadModule();
    console.log('[DEBUG] WASM module loaded successfully');
  } else {
    console.log('[DEBUG] Using cached WASM module');
  }
  
  console.log('[DEBUG] Creating Go instance');
  const go = new Go();
  
  let ready;
  const readyPromise = new Promise((resolve) => {
    console.log('[DEBUG] Ready promise created');
    ready = resolve;
  });
  
  console.log('[DEBUG] Creating WebAssembly instance');
  const instance = new WebAssembly.Instance(mod, {
    ...go.importObject,
    workers: {
      ready: () => {
        console.log('[DEBUG] WASM ready callback triggered');
        ready();
      },
    },
  });
  console.log('[DEBUG] WebAssembly instance created');
  
  console.log('[DEBUG] Starting go.run()');
  go.run(instance, ctx);
  console.log('[DEBUG] go.run() called, waiting for ready signal');
  
  await readyPromise;
  console.log('[DEBUG] Ready promise resolved, run() complete');
}

async function fetch(req, env, ctx) {
  console.log('[DEBUG] fetch() handler started');
  console.log('[DEBUG] Request URL:', req.url);
  console.log('[DEBUG] Request method:', req.method);
  
  const binding = {};
  
  try {
    console.log('[DEBUG] Calling run()');
    await run(createRuntimeContext({ env, ctx, binding }));
    console.log('[DEBUG] run() completed');
    
    console.log('[DEBUG] Checking if binding.handleRequest exists:', typeof binding.handleRequest);
    
    if (!binding.handleRequest) {
      console.error('[ERROR] binding.handleRequest is undefined!');
      return new Response('Internal error: handleRequest not initialized', { status: 500 });
    }
    
    console.log('[DEBUG] Calling binding.handleRequest()');
    const response = await binding.handleRequest(req);
    console.log('[DEBUG] Got response, status:', response?.status);
    
    return response;
  } catch (error) {
    console.error('[ERROR] Exception in fetch():', error);
    console.error('[ERROR] Stack trace:', error.stack);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function scheduled(event, env, ctx) {
  console.log('[DEBUG] scheduled() handler started');
  
  const binding = {};
  
  try {
    await run(createRuntimeContext({ env, ctx, binding }));
    console.log('[DEBUG] Calling binding.runScheduler()');
    return binding.runScheduler(event);
  } catch (error) {
    console.error('[ERROR] Exception in scheduled():', error);
    throw error;
  }
}

async function queue(batch, env, ctx) {
  console.log('[DEBUG] queue() handler started');
  
  const binding = {};
  
  try {
    await run(createRuntimeContext({ env, ctx, binding }));
    console.log('[DEBUG] Calling binding.handleQueueMessageBatch()');
    return binding.handleQueueMessageBatch(batch);
  } catch (error) {
    console.error('[ERROR] Exception in queue():', error);
    throw error;
  }
}

// onRequest handles request to Cloudflare Pages
async function onRequest(ctx) {
  console.log('[DEBUG] onRequest() handler started');
  
  const binding = {};
  const { request, env } = ctx;
  
  try {
    await run(createRuntimeContext({ env, ctx, binding }));
    console.log('[DEBUG] Calling binding.handleRequest() from onRequest');
    return binding.handleRequest(request);
  } catch (error) {
    console.error('[ERROR] Exception in onRequest():', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

export default {
  fetch,
  scheduled,
  queue,
  onRequest,
};
