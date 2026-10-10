/* Web Worker: runs Mathcad worksheets off the main thread */
/* global importScripts, EC */
importScripts('engine.js', 'compute.js');
const docs = {};
self.EC_SHEET = (id, d) => { docs[id] = d; };
self.onmessage = ev => {
  const { req, id, inputs } = ev.data;
  try {
    if (!docs[id]) importScripts('../../sheets/' + encodeURIComponent(id) + '.js');
    const r = EC.mcadc.compute(docs[id], inputs || {});
    self.postMessage({ req, r });
  } catch (e) {
    self.postMessage({ req, error: (e && e.message) || String(e) });
  }
};
