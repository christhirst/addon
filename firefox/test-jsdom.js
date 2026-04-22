const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('popup.html', 'utf8');

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    resources: "usable"
});

dom.window.document.addEventListener('DOMContentLoaded', () => {
    try {
        const js = fs.readFileSync('popup.js', 'utf8');
        dom.window.browser = {
            storage: { local: { get: async () => ({ rules: [] }), set: async () => {} } },
            runtime: { sendMessage: async () => ({ log: [] }) }
        };
        dom.window.eval(js);
        console.log("SUCCESS: popup.js loaded without errors");
    } catch (e) {
        console.error("ERROR loading popup.js:");
        console.error(e);
    }
});
