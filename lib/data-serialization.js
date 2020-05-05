const v8 = require('v8');

const useAdvanced = process.versions.node >= '12.16.0';
exports.useAdvanced = useAdvanced;

exports.deserializeData = useAdvanced ? data => data : data => v8.deserialize(Uint8Array.from(data));
exports.serializeData = useAdvanced ? data => data : data => [...v8.serialize(data)];
