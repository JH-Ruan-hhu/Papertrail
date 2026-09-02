'use strict';

const genericJsonLd = require('./generic-jsonld');

const providers = new Map([[genericJsonLd.id, genericJsonLd]]);

function register(provider) {
  if (!provider?.id || typeof provider.parse !== 'function') throw new Error('岗位源 Adapter 无效。');
  providers.set(provider.id, provider);
}

function get(id = genericJsonLd.id) { return providers.get(id) || genericJsonLd; }
function list() { return [...providers.values()].map((provider) => ({ id: provider.id })); }

module.exports = { register, get, list };
