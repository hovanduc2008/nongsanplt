// utils/json.js
const fs = require('fs');

function readJSON(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

module.exports = { readJSON, writeJSON };
