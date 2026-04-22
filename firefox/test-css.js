const fs = require('fs');
const css = fs.readFileSync('popup.css', 'utf8');
let openBraces = (css.match(/\{/g) || []).length;
let closeBraces = (css.match(/\}/g) || []).length;
console.log(`Open braces: ${openBraces}, Close braces: ${closeBraces}`);
if (openBraces !== closeBraces) {
    console.error("Mismatch in braces!");
}
