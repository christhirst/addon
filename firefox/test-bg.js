const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('background.js', 'utf8');

const browser = {
    storage: { local: { get: async () => ({ rules: [] }), set: async () => {} } },
    webRequest: { onBeforeRequest: { addListener: () => {} }, onBeforeSendHeaders: { addListener: () => {} } },
    runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => {} }
};

const context = vm.createContext({
    browser,
    console
});

try {
    vm.runInContext(code, context);
    console.log("Executed background.js successfully.");
} catch (e) {
    console.error(e);
}
