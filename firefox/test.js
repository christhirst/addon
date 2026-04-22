const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('popup.js', 'utf8');

const mockElement = {
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    textContent: '',
    appendChild: () => {},
    reset: () => {},
    focus: () => {},
    innerHTML: '',
    dispatchEvent: () => {},
    style: {}
};

const document = {
    querySelector: () => mockElement,
    querySelectorAll: () => [mockElement],
    createElement: () => ({ ...mockElement })
};

const window = {
    URL: class {
        constructor(url) {
            this.host = "example.com";
            this.pathname = "/";
        }
        static createObjectURL() { return ""; }
        static revokeObjectURL() {}
    }
};

const URL = window.URL;

const browser = {
    storage: { local: { get: async () => ({ rules: [] }), set: async () => {} } },
    runtime: { sendMessage: async () => ({ log: [] }) }
};

const context = vm.createContext({
    document,
    window,
    browser,
    URL,
    Blob: class {},
    Date: class { toISOString() { return "2026"; } },
    setTimeout,
    clearTimeout,
    console
});

try {
    vm.runInContext(code, context);
    console.log("Executed popup.js successfully.");
} catch (e) {
    console.error(e);
}
